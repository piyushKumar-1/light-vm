package storage

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/piyushkumar-1/light_vm/internal/config"
)

// SeedDashboards imports YAML-defined dashboards into the database if
// the dashboards table is empty. This runs once on first boot.
func SeedDashboards(ctx context.Context, store *SQLiteStore, dashboards []config.DashboardConfig, logger *slog.Logger) error {
	count, err := store.CountDashboards(ctx)
	if err != nil {
		return fmt.Errorf("count dashboards: %w", err)
	}
	if count > 0 {
		logger.Info("dashboards already seeded", "count", count)
		return nil
	}
	if len(dashboards) == 0 {
		return nil
	}

	for i, dc := range dashboards {
		panels := make([]PanelBody, len(dc.Panels))
		for j, p := range dc.Panels {
			panels[j] = PanelBody{
				Title: p.Title,
				Type:  p.Type,
				Query: QueryBody{
					Metric:       p.Query.Metric,
					Type:         p.Query.Type,
					Percentiles:  p.Query.Percentiles,
					Target:       p.Query.Target,
					GroupBy:      p.Query.GroupBy,
					Labels:       p.Query.Labels,
					LabelDisplay: p.Query.LabelDisplay,
				},
				YAxis: YAxisBody{
					Unit: p.YAxis.Unit,
					Min:  p.YAxis.Min,
					Max:  p.YAxis.Max,
					Side: p.YAxis.Side,
				},
			}
		}

		d := &Dashboard{
			Name:      dc.Name,
			SortOrder: i,
			Config: DashboardBody{
				UIRefresh:        dc.UIRefresh.Duration.String(),
				RescrapeInterval: dc.RescrapeInterval.Duration.String(),
				TimeRange:        dc.TimeRange.Duration.String(),
				Panels:           panels,
			},
		}

		if err := store.CreateDashboard(ctx, d); err != nil {
			return fmt.Errorf("seed dashboard %q: %w", dc.Name, err)
		}
		logger.Info("seeded dashboard", "name", dc.Name, "id", d.ID)
	}
	return nil
}
