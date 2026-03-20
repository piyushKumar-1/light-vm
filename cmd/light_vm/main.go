package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/piyushkumar-1/light_vm/internal/api"
	"github.com/piyushkumar-1/light_vm/internal/config"
	"github.com/piyushkumar-1/light_vm/internal/scraper"
	"github.com/piyushkumar-1/light_vm/internal/storage"
	"github.com/piyushkumar-1/light_vm/web"
)

var (
	version = "dev"
	commit  = "unknown"
)

func main() {
	configPath := flag.String("config", "light_vm.yml", "Path to configuration file")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("light_vm %s (%s)\n", version, commit)
		os.Exit(0)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("failed to load config", "error", err, "path", *configPath)
		os.Exit(1)
	}
	logger.Info("configuration loaded",
		"targets", len(cfg.Targets),
		"dashboards", len(cfg.Dashboards),
		"retention", cfg.Global.Retention.Duration,
		"auth", cfg.Auth.Enabled())

	store, err := storage.NewSQLiteStore(cfg.Storage.Path, cfg.Storage.WALMode)
	if err != nil {
		logger.Error("failed to initialize storage", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	// Seed YAML dashboards into DB on first boot
	if err := storage.SeedDashboards(context.Background(), store, cfg.Dashboards, logger); err != nil {
		logger.Warn("failed to seed dashboards", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	targetRetentions := make(map[string]time.Duration)
	for _, t := range cfg.Targets {
		if t.Retention.Duration > 0 {
			targetRetentions[t.Name] = t.Retention.Duration
		}
	}
	go storage.StartRetentionPruner(ctx, store, cfg.Global.Retention.Duration, targetRetentions, logger)

	// Prune expired sessions periodically
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := store.PruneSessions(ctx); err != nil {
					logger.Error("session prune failed", "error", err)
				}
			}
		}
	}()

	mgr := scraper.NewManager(cfg, store, logger)
	go mgr.Start(ctx)

	srv := api.NewServer(cfg, store, mgr, web.StaticHandler())
	httpServer := &http.Server{
		Addr:         cfg.Global.ListenAddress,
		Handler:      srv,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		logger.Info("starting HTTP server", "address", cfg.Global.ListenAddress)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()

	sig := <-sigCh
	logger.Info("received signal, shutting down", "signal", sig)
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = httpServer.Shutdown(shutdownCtx)

	logger.Info("shutdown complete")
}
