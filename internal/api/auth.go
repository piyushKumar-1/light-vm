package api

import (
	"encoding/json"
	"net/http"
	"time"
)

const sessionCookieName = "lvm_session"
const sessionTTL = 24 * time.Hour

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type sessionResponse struct {
	Authenticated bool   `json:"authenticated"`
	AuthRequired  bool   `json:"auth_required"`
	Username      string `json:"username,omitempty"`
}

// authMiddleware checks the session cookie. If auth is not configured, it's a no-op.
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.Auth.Enabled() {
			next.ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie(sessionCookieName)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		sess, err := s.store.GetSession(r.Context(), cookie.Value)
		if err != nil || sess == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.Auth.Enabled() {
		writeJSON(w, map[string]string{"error": "auth not configured"})
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username != s.cfg.Auth.Username || req.Password != s.cfg.Auth.Password {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	sess, err := s.store.CreateSession(r.Context(), req.Username, sessionTTL)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sess.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(sessionTTL.Seconds()),
	})

	writeJSON(w, sessionResponse{
		Authenticated: true,
		AuthRequired:  true,
		Username:      sess.Username,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil {
		s.store.DeleteSession(r.Context(), cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handleSessionCheck(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.Auth.Enabled() {
		writeJSON(w, sessionResponse{
			Authenticated: true,
			AuthRequired:  false,
		})
		return
	}

	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		writeJSON(w, sessionResponse{AuthRequired: true})
		return
	}

	sess, err := s.store.GetSession(r.Context(), cookie.Value)
	if err != nil || sess == nil {
		writeJSON(w, sessionResponse{AuthRequired: true})
		return
	}

	writeJSON(w, sessionResponse{
		Authenticated: true,
		AuthRequired:  true,
		Username:      sess.Username,
	})
}
