package web

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed dist
var assets embed.FS

// StaticHandler returns an http.Handler that serves the embedded web assets
// with SPA fallback to index.html.
func StaticHandler() http.Handler {
	stripped, _ := fs.Sub(assets, "dist")
	fileServer := http.FileServer(http.FS(stripped))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}

		cleanPath := strings.TrimPrefix(path, "/")
		if _, err := fs.Stat(stripped, cleanPath); err != nil {
			// SPA fallback
			r.URL.Path = "/index.html"
			fileServer.ServeHTTP(w, r)
			return
		}

		// Cache hashed assets aggressively
		if strings.HasPrefix(cleanPath, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		fileServer.ServeHTTP(w, r)
	})
}
