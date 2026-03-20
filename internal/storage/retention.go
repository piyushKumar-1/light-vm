package storage

import (
	"context"
	"log/slog"
	"time"
)

// StartRetentionPruner runs a background loop that deletes samples older than
// the configured retention duration. Per-target retention overrides the global default.
func StartRetentionPruner(ctx context.Context, store Storage, globalRetention time.Duration, targetRetentions map[string]time.Duration, logger *slog.Logger) {
	interval := globalRetention / 6
	if interval > 10*time.Minute {
		interval = 10 * time.Minute
	}
	if interval < 1*time.Minute {
		interval = 1 * time.Minute
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Prune per-target with custom retention
			for target, retention := range targetRetentions {
				cutoff := time.Now().Add(-retention)
				deleted, err := store.PruneTarget(ctx, target, cutoff)
				if err != nil {
					logger.Error("target retention prune failed", "target", target, "error", err)
				} else if deleted > 0 {
					logger.Info("pruned target samples", "target", target, "deleted", deleted, "retention", retention)
				}
			}

			// Global prune catches anything not covered by per-target rules
			cutoff := time.Now().Add(-globalRetention)
			deleted, err := store.Prune(ctx, cutoff)
			if err != nil {
				logger.Error("retention prune failed", "error", err)
			} else if deleted > 0 {
				logger.Info("pruned old samples", "deleted", deleted, "cutoff", cutoff)
			}
		}
	}
}
