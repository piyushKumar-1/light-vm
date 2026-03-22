package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/piyushkumar-1/light_vm/internal/config"
	"github.com/piyushkumar-1/light_vm/internal/scraper"
	"github.com/piyushkumar-1/light_vm/internal/storage"
)

// Server holds the HTTP API and serves the embedded web UI.
type Server struct {
	cfg       *config.Config
	store     *storage.SQLiteStore
	scraper   *scraper.Manager
	router    chi.Router
	startTime time.Time

	// queryCache stores recent query results to avoid recomputation on polls.
	queryCache   map[string]queryCacheEntry
	queryCacheMu sync.Mutex
}

type queryCacheEntry struct {
	data      []byte
	expiresAt time.Time
}

// NewServer wires up routes and returns an http.Handler.
func NewServer(cfg *config.Config, store *storage.SQLiteStore, mgr *scraper.Manager, staticHandler http.Handler) *Server {
	s := &Server{
		cfg:        cfg,
		store:      store,
		scraper:    mgr,
		startTime:  time.Now(),
		queryCache: make(map[string]queryCacheEntry),
	}

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))

	r.Route("/api/v1", func(r chi.Router) {
		// Public endpoints
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/logout", s.handleLogout)
		r.Get("/auth/session", s.handleSessionCheck)
		r.Get("/health", s.handleHealth)

		// Protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware)
			r.Get("/query_range", s.handleQueryRange)
			r.Get("/targets", s.handleTargets)
			r.Get("/metrics", s.handleListMetrics)
			r.Get("/label_values", s.handleLabelValues)

			// Dashboard CRUD
			r.Get("/dashboards", s.handleListDashboards)
			r.Post("/dashboards", s.handleCreateDashboard)
			r.Get("/dashboards/{id}", s.handleGetDashboard)
			r.Put("/dashboards/{id}", s.handleUpdateDashboard)
			r.Delete("/dashboards/{id}", s.handleDeleteDashboard)
			r.Post("/dashboards/{id}/duplicate", s.handleDuplicateDashboard)
		})
	})

	r.Handle("/*", staticHandler)

	s.router = r
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}
