package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

func (s *SQLiteStore) CountDashboards(ctx context.Context) (int, error) {
	var count int
	err := s.reader.QueryRowContext(ctx, `SELECT COUNT(*) FROM dashboards`).Scan(&count)
	return count, err
}

func (s *SQLiteStore) ListDashboards(ctx context.Context, search string) ([]Dashboard, error) {
	query := `SELECT id, name, description, config_json, sort_order, created_at, updated_at FROM dashboards`
	args := []any{}
	if search != "" {
		query += ` WHERE name LIKE ?`
		args = append(args, "%"+search+"%")
	}
	query += ` ORDER BY sort_order ASC, name ASC`

	rows, err := s.reader.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dashboards []Dashboard
	for rows.Next() {
		var d Dashboard
		var createdMs, updatedMs int64
		if err := rows.Scan(&d.ID, &d.Name, &d.Description, &d.ConfigJSON,
			&d.SortOrder, &createdMs, &updatedMs); err != nil {
			return nil, err
		}
		d.CreatedAt = time.UnixMilli(createdMs)
		d.UpdatedAt = time.UnixMilli(updatedMs)
		if err := json.Unmarshal([]byte(d.ConfigJSON), &d.Config); err != nil {
			return nil, fmt.Errorf("unmarshal dashboard %s config: %w", d.ID, err)
		}
		dashboards = append(dashboards, d)
	}
	return dashboards, rows.Err()
}

func (s *SQLiteStore) GetDashboard(ctx context.Context, id string) (*Dashboard, error) {
	var d Dashboard
	var createdMs, updatedMs int64
	err := s.reader.QueryRowContext(ctx,
		`SELECT id, name, description, config_json, sort_order, created_at, updated_at
		 FROM dashboards WHERE id = ?`, id,
	).Scan(&d.ID, &d.Name, &d.Description, &d.ConfigJSON,
		&d.SortOrder, &createdMs, &updatedMs)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	d.CreatedAt = time.UnixMilli(createdMs)
	d.UpdatedAt = time.UnixMilli(updatedMs)
	if err := json.Unmarshal([]byte(d.ConfigJSON), &d.Config); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}
	return &d, nil
}

func (s *SQLiteStore) CreateDashboard(ctx context.Context, d *Dashboard) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	now := time.Now()
	d.CreatedAt = now
	d.UpdatedAt = now

	configBytes, err := json.Marshal(d.Config)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	_, err = s.writer.ExecContext(ctx,
		`INSERT INTO dashboards (id, name, description, config_json, sort_order, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		d.ID, d.Name, d.Description, string(configBytes),
		d.SortOrder, now.UnixMilli(), now.UnixMilli())
	return err
}

func (s *SQLiteStore) UpdateDashboard(ctx context.Context, d *Dashboard) error {
	d.UpdatedAt = time.Now()
	configBytes, err := json.Marshal(d.Config)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	res, err := s.writer.ExecContext(ctx,
		`UPDATE dashboards SET name=?, description=?, config_json=?, sort_order=?, updated_at=?
		 WHERE id=?`,
		d.Name, d.Description, string(configBytes),
		d.SortOrder, d.UpdatedAt.UnixMilli(), d.ID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("dashboard %s not found", d.ID)
	}
	return nil
}

func (s *SQLiteStore) DeleteDashboard(ctx context.Context, id string) error {
	res, err := s.writer.ExecContext(ctx, `DELETE FROM dashboards WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("dashboard %s not found", id)
	}
	return nil
}
