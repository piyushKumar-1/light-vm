package storage

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// SQLiteStore implements Storage using an embedded SQLite database.
type SQLiteStore struct {
	writer *sql.DB
	reader *sql.DB
}

// NewSQLiteStore opens (or creates) a SQLite database at path.
func NewSQLiteStore(path string, walMode bool) (*SQLiteStore, error) {
	dsn := path
	if path == ":memory:" {
		dsn = "file::memory:?cache=shared"
	}

	writer, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open writer: %w", err)
	}
	writer.SetMaxOpenConns(1)

	reader, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open reader: %w", err)
	}
	reader.SetMaxOpenConns(4)

	pragmas := []string{
		"PRAGMA busy_timeout = 5000",
		"PRAGMA cache_size = -64000",
		"PRAGMA temp_store = MEMORY",
	}
	if walMode {
		pragmas = append(pragmas,
			"PRAGMA journal_mode = WAL",
			"PRAGMA synchronous = NORMAL",
		)
	}

	for _, p := range pragmas {
		if _, err := writer.Exec(p); err != nil {
			return nil, fmt.Errorf("pragma %q: %w", p, err)
		}
	}

	if _, err := writer.Exec(schemaSQL); err != nil {
		return nil, fmt.Errorf("create schema: %w", err)
	}

	return &SQLiteStore{writer: writer, reader: reader}, nil
}

func (s *SQLiteStore) WriteSamples(ctx context.Context, samples []Sample) error {
	if len(samples) == 0 {
		return nil
	}

	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO samples (metric_name, labels_hash, labels_json, value, timestamp, metric_type, target)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	metaStmt, err := tx.PrepareContext(ctx,
		`INSERT INTO metric_meta (metric_name, target, metric_type, labels_json, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(metric_name, target) DO UPDATE SET
		    metric_type = excluded.metric_type,
		    labels_json = excluded.labels_json,
		    updated_at = excluded.updated_at`)
	if err != nil {
		return err
	}
	defer metaStmt.Close()

	seenMeta := make(map[string]bool)

	for _, sample := range samples {
		labelsJSON, hash := encodeLabels(sample.Labels)
		target := sample.Labels["__target__"]
		tsMs := sample.Timestamp.UnixMilli()

		if _, err := stmt.ExecContext(ctx,
			sample.MetricName, hash, labelsJSON, sample.Value,
			tsMs, sample.MetricType, target,
		); err != nil {
			return err
		}

		metaKey := sample.MetricName + "|" + target
		if !seenMeta[metaKey] {
			seenMeta[metaKey] = true
			labelNames := labelKeys(sample.Labels)
			labelNamesJSON, _ := json.Marshal(labelNames)
			if _, err := metaStmt.ExecContext(ctx,
				sample.MetricName, target, sample.MetricType,
				string(labelNamesJSON), time.Now().UnixMilli(),
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (s *SQLiteStore) QueryRange(ctx context.Context, params QueryParams) ([]TimeSeries, error) {
	startMs := params.Start.UnixMilli()
	endMs := params.End.UnixMilli()

	// When step > 0, use SQL-level downsampling via GROUP BY time bucket
	if params.Step > 0 {
		return s.queryRangeDownsampled(ctx, params, startMs, endMs)
	}

	query := `SELECT labels_json, value, timestamp FROM samples
	          WHERE metric_name = ? AND timestamp >= ? AND timestamp <= ?`
	args := []any{params.MetricName, startMs, endMs}

	if params.Target != "" && params.Target != "*" {
		query += ` AND target = ?`
		args = append(args, params.Target)
	}
	query += ` ORDER BY timestamp ASC`

	rows, err := s.reader.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seriesMap := make(map[string]*TimeSeries)

	for rows.Next() {
		var labelsJSON string
		var value float64
		var tsMs int64
		if err := rows.Scan(&labelsJSON, &value, &tsMs); err != nil {
			return nil, err
		}

		var labels map[string]string
		if err := json.Unmarshal([]byte(labelsJSON), &labels); err != nil {
			continue
		}

		if !matchLabels(labels, params.LabelMatch) {
			continue
		}

		key := labelsJSON
		ts, ok := seriesMap[key]
		if !ok {
			ts = &TimeSeries{Labels: labels}
			seriesMap[key] = ts
		}
		ts.Datapoints = append(ts.Datapoints,
			[2]float64{float64(tsMs) / 1000.0, value})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]TimeSeries, 0, len(seriesMap))
	for _, ts := range seriesMap {
		result = append(result, *ts)
	}
	return result, nil
}

func (s *SQLiteStore) queryRangeDownsampled(ctx context.Context, params QueryParams, startMs, endMs int64) ([]TimeSeries, error) {
	stepMs := params.Step.Milliseconds()

	query := `SELECT labels_hash, labels_json, AVG(value) AS avg_val,
	                 (timestamp / ?) * ? AS ts_bucket
	          FROM samples
	          WHERE metric_name = ? AND timestamp >= ? AND timestamp <= ?`
	args := []any{stepMs, stepMs, params.MetricName, startMs, endMs}

	if params.Target != "" && params.Target != "*" {
		query += ` AND target = ?`
		args = append(args, params.Target)
	}
	query += ` GROUP BY labels_hash, ts_bucket ORDER BY ts_bucket ASC`

	rows, err := s.reader.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seriesMap := make(map[string]*TimeSeries)
	labelsCache := make(map[string]map[string]string) // labels_hash -> parsed labels

	for rows.Next() {
		var labelsHash, labelsJSON string
		var value float64
		var tsBucket int64
		if err := rows.Scan(&labelsHash, &labelsJSON, &value, &tsBucket); err != nil {
			return nil, err
		}

		labels, ok := labelsCache[labelsHash]
		if !ok {
			if err := json.Unmarshal([]byte(labelsJSON), &labels); err != nil {
				continue
			}
			labelsCache[labelsHash] = labels
		}

		if !matchLabels(labels, params.LabelMatch) {
			continue
		}

		ts, ok := seriesMap[labelsHash]
		if !ok {
			ts = &TimeSeries{Labels: labels}
			seriesMap[labelsHash] = ts
		}
		ts.Datapoints = append(ts.Datapoints,
			[2]float64{float64(tsBucket) / 1000.0, value})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]TimeSeries, 0, len(seriesMap))
	for _, ts := range seriesMap {
		result = append(result, *ts)
	}
	return result, nil
}

func (s *SQLiteStore) ListMetrics(ctx context.Context, target string) ([]MetricMeta, error) {
	query := `SELECT metric_name, target, metric_type, labels_json FROM metric_meta`
	args := []any{}
	if target != "" && target != "*" {
		query += ` WHERE target = ?`
		args = append(args, target)
	}
	query += ` ORDER BY metric_name`

	rows, err := s.reader.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metas []MetricMeta
	for rows.Next() {
		var m MetricMeta
		var labelsJSON string
		if err := rows.Scan(&m.Name, &m.Target, &m.Type, &labelsJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(labelsJSON), &m.LabelNames); err != nil {
			m.LabelNames = nil
		}
		metas = append(metas, m)
	}
	return metas, rows.Err()
}

func (s *SQLiteStore) Prune(ctx context.Context, olderThan time.Time) (int64, error) {
	res, err := s.writer.ExecContext(ctx,
		`DELETE FROM samples WHERE timestamp < ?`, olderThan.UnixMilli())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) PruneTarget(ctx context.Context, target string, olderThan time.Time) (int64, error) {
	res, err := s.writer.ExecContext(ctx,
		`DELETE FROM samples WHERE target = ? AND timestamp < ?`, target, olderThan.UnixMilli())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) Close() error {
	s.reader.Close()
	return s.writer.Close()
}

// --- helpers ---

func encodeLabels(labels map[string]string) (string, string) {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	pairs := make([]string, len(keys))
	sorted := make(map[string]string, len(labels))
	for i, k := range keys {
		pairs[i] = k + "=" + labels[k]
		sorted[k] = labels[k]
	}

	jsonBytes, _ := json.Marshal(sorted)
	h := sha256.Sum256([]byte(strings.Join(pairs, ",")))
	return string(jsonBytes), hex.EncodeToString(h[:16])
}

func labelKeys(labels map[string]string) []string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		if !strings.HasPrefix(k, "__") {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	return keys
}

func matchLabels(labels, matchers map[string]string) bool {
	for k, pattern := range matchers {
		v, ok := labels[k]
		if !ok {
			return false
		}
		if strings.HasPrefix(pattern, "~") {
			matched, err := regexp.MatchString(pattern[1:], v)
			if err != nil || !matched {
				return false
			}
		} else if v != pattern {
			return false
		}
	}
	return true
}
