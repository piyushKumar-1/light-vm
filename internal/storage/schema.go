package storage

const schemaSQL = `
CREATE TABLE IF NOT EXISTS samples (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT    NOT NULL,
    labels_hash TEXT    NOT NULL,
    labels_json TEXT    NOT NULL,
    value       REAL    NOT NULL,
    timestamp   INTEGER NOT NULL,
    metric_type TEXT    NOT NULL,
    target      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_samples_query
    ON samples (metric_name, target, timestamp);

CREATE INDEX IF NOT EXISTS idx_samples_ts
    ON samples (timestamp);

CREATE INDEX IF NOT EXISTS idx_samples_labels
    ON samples (metric_name, labels_hash, timestamp);

CREATE TABLE IF NOT EXISTS metric_meta (
    metric_name TEXT NOT NULL,
    target      TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    labels_json TEXT NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (metric_name, target)
);

CREATE TABLE IF NOT EXISTS dashboards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboards_name ON dashboards (name);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
`
