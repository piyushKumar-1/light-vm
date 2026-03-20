package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/piyushkumar-1/light_vm/internal/storage"
)

func (s *Server) handleListDashboards(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	dashboards, err := s.store.ListDashboards(r.Context(), search)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if dashboards == nil {
		dashboards = []storage.Dashboard{}
	}
	writeJSON(w, dashboards)
}

func (s *Server) handleGetDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d, err := s.store.GetDashboard(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, d)
}

func (s *Server) handleCreateDashboard(w http.ResponseWriter, r *http.Request) {
	var d storage.Dashboard
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if d.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if err := s.store.CreateDashboard(r.Context(), &d); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, d)
}

func (s *Server) handleUpdateDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var d storage.Dashboard
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	d.ID = id
	if d.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if err := s.store.UpdateDashboard(r.Context(), &d); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, d)
}

func (s *Server) handleDeleteDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.store.DeleteDashboard(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDuplicateDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	original, err := s.store.GetDashboard(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if original == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	dup := &storage.Dashboard{
		Name:        original.Name + " (copy)",
		Description: original.Description,
		Config:      original.Config,
		SortOrder:   original.SortOrder,
	}
	if err := s.store.CreateDashboard(r.Context(), dup); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, dup)
}
