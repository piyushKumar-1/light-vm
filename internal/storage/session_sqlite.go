package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"time"
)

// Session represents an authenticated user session.
type Session struct {
	Token     string
	Username  string
	CreatedAt time.Time
	ExpiresAt time.Time
}

func (s *SQLiteStore) CreateSession(ctx context.Context, username string, ttl time.Duration) (*Session, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(b)
	now := time.Now()
	expires := now.Add(ttl)

	_, err := s.writer.ExecContext(ctx,
		`INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)`,
		token, username, now.UnixMilli(), expires.UnixMilli())
	if err != nil {
		return nil, err
	}
	return &Session{Token: token, Username: username, CreatedAt: now, ExpiresAt: expires}, nil
}

func (s *SQLiteStore) GetSession(ctx context.Context, token string) (*Session, error) {
	var sess Session
	var createdMs, expiresMs int64
	err := s.reader.QueryRowContext(ctx,
		`SELECT token, username, created_at, expires_at FROM sessions WHERE token = ?`,
		token).Scan(&sess.Token, &sess.Username, &createdMs, &expiresMs)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sess.CreatedAt = time.UnixMilli(createdMs)
	sess.ExpiresAt = time.UnixMilli(expiresMs)
	if time.Now().After(sess.ExpiresAt) {
		_, _ = s.writer.ExecContext(ctx, `DELETE FROM sessions WHERE token = ?`, token)
		return nil, nil
	}
	return &sess, nil
}

func (s *SQLiteStore) DeleteSession(ctx context.Context, token string) error {
	_, err := s.writer.ExecContext(ctx, `DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (s *SQLiteStore) PruneSessions(ctx context.Context) error {
	_, err := s.writer.ExecContext(ctx,
		`DELETE FROM sessions WHERE expires_at < ?`, time.Now().UnixMilli())
	return err
}
