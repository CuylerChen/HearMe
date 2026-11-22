package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"

	"hearme/realtime/internal/language"
)

const ListenAddr = "127.0.0.1:18200"

type sessionView struct {
	ID        string
	Mode      string
	Preferred string
	Current   string
	Provider  string
	State     string
	Created   time.Time
}

type TurnEvent struct {
	Locale     string
	SampleRate int
	LatencyMs  int
	Audio      []byte
}

type Turner func(sessionID string, pcm []byte, emit func(TurnEvent) error) error

type TurnStyle struct {
	VoiceKey     string
	ListenMore   bool
	AskQuestions bool
	Short        bool
	Gentle       bool
	ListenerID   string
	ListenerName string
	Manner       string
	SpeakerZh    string
	SpeakerEn    string
}

type Server struct {
	mu          sync.Mutex
	sessions    map[string]*sessionView
	Turn        Turner
	OnInterrupt func(sessionID string)
	OnStyle     func(sessionID string, style TurnStyle)
	OnForget    func(sessionID string)
}

func New() *Server {
	return &Server{sessions: map[string]*sessionView{}}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /v1/languages", s.languages)
	mux.HandleFunc("GET /v1/voices", s.voices)
	mux.HandleFunc("POST /v1/sessions", s.createSession)
	mux.HandleFunc("GET /v1/sessions/{id}", s.sessionStatus)
	mux.HandleFunc("DELETE /v1/sessions/{id}", s.deleteSession)
	mux.HandleFunc("POST /v1/sessions/{id}/turns", s.turn)
	mux.HandleFunc("POST /v1/sessions/{id}/interrupt", s.interrupt)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":   true,
		"bind": ListenAddr,
	})
}

func (s *Server) languages(w http.ResponseWriter, _ *http.Request) {
	items := make([]map[string]string, 0, 6)
	for _, code := range language.LaunchCodes() {
		items = append(items, map[string]string{
			"code":            string(code),
			"model_language":  language.ModelName(code),
			"quality_status":  "testing",
			"conversation":    "auto",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"strategy":  "auto",
		"languages": items,
	})
}

func (s *Server) voices(w http.ResponseWriter, _ *http.Request) {
	keys := []string{"gentle", "calm", "warm", "thoughtful"}
	voices := make([]map[string]any, 0, len(keys))
	langs := make([]map[string]any, 0, 6)
	for _, code := range language.LaunchCodes() {
		langs = append(langs, map[string]any{
			"language_code": string(code),
			"quality_status": "testing",
			"enabled":        false,
		})
	}
	for _, key := range keys {
		voices = append(voices, map[string]any{
			"voice_key": key,
			"provider":  "local-gpu",
			"languages": langs,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"voices": voices})
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Mode      string `json:"conversation_language_mode"`
		Preferred string `json:"preferred_conversation_locale"`
		VoiceKey  string `json:"voice_key"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req)
	}
	mode := req.Mode
	if mode == "" {
		mode = string(language.ModeAuto)
	}
	if mode != string(language.ModeAuto) && mode != string(language.ModePreferred) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_language_mode"})
		return
	}
	if req.Preferred != "" && !validLocale(req.Preferred) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_locale"})
		return
	}
	id := newID()
	view := &sessionView{
		ID:        id,
		Mode:      mode,
		Preferred: req.Preferred,
		Provider:  "local-gpu",
		State:     "ready",
		Created:   time.Now(),
	}
	s.mu.Lock()
	s.sessions[id] = view
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, sessionJSON(view))
}

func (s *Server) sessionStatus(w http.ResponseWriter, r *http.Request) {
	view := s.get(r.PathValue("id"))
	if view == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not_found"})
		return
	}
	writeJSON(w, http.StatusOK, sessionJSON(view))
}

func (s *Server) turn(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.get(id) == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not_found"})
		return
	}
	if s.Turn == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "voice_workers_unavailable"})
		return
	}
	var req struct {
		PCM          string `json:"pcm16k_b64"`
		VoiceKey     string `json:"voice_key"`
		ListenMore   *bool  `json:"listen_more"`
		AskQuestions *bool  `json:"ask_questions"`
		Short         bool   `json:"short"`
		Gentle        *bool  `json:"gentle"`
		ListenerID    string `json:"listener_id"`
		ListenerName  string `json:"listener_name"`
		Manner        string `json:"manner"`
		SpeakerZh     string `json:"speaker_zh"`
		SpeakerEn     string `json:"speaker_en"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_json"})
		return
	}
	if s.OnStyle != nil {
		s.OnStyle(id, TurnStyle{
			VoiceKey:     req.VoiceKey,
			ListenMore:   req.ListenMore == nil || *req.ListenMore,
			AskQuestions: req.AskQuestions == nil || *req.AskQuestions,
			Short:        req.Short,
			Gentle:       req.Gentle == nil || *req.Gentle,
			ListenerID:   req.ListenerID,
			ListenerName: req.ListenerName,
			Manner:       req.Manner,
			SpeakerZh:    req.SpeakerZh,
			SpeakerEn:    req.SpeakerEn,
		})
	}
	pcm, err := base64.StdEncoding.DecodeString(req.PCM)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_pcm"})
		return
	}
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	emit := func(ev TurnEvent) error {
		line := map[string]any{
			"type":       "audio",
			"session_id": id,
			"latency_ms": ev.LatencyMs,
		}
		if ev.Locale != "" {
			line["current_locale"] = ev.Locale
		}
		if len(ev.Audio) > 0 {
			line["sample_rate"] = ev.SampleRate
			line["audio_b64"] = base64.StdEncoding.EncodeToString(ev.Audio)
		}
		if err := writeLine(w, line); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	}
	if err := s.Turn(id, pcm, emit); err != nil {
		_ = writeLine(w, map[string]any{"type": "error", "error": "voice_turn_failed"})
		return
	}
	_ = writeLine(w, map[string]any{"type": "done", "session_id": id})
}

func (s *Server) interrupt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	view := s.get(id)
	if view == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not_found"})
		return
	}
	s.mu.Lock()
	if live := s.sessions[id]; live != nil {
		live.State = "interrupted"
	}
	hook := s.OnInterrupt
	s.mu.Unlock()
	if hook != nil {
		hook(id)
	}
	writeJSON(w, http.StatusOK, map[string]any{"session_id": id, "state": "interrupted"})
}

func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	_, ok := s.sessions[id]
	delete(s.sessions, id)
	forget := s.OnForget
	s.mu.Unlock()
	if forget != nil {
		forget(id)
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not_found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session_id": id, "state": "closed"})
}

func (s *Server) get(id string) *sessionView {
	s.mu.Lock()
	defer s.mu.Unlock()
	view := s.sessions[id]
	if view == nil {
		return nil
	}
	copy := *view
	return &copy
}

func sessionJSON(view *sessionView) map[string]any {
	var preferred any
	if view.Preferred == "" {
		preferred = nil
	} else {
		preferred = view.Preferred
	}
	var current any
	if view.Current == "" {
		current = nil
	} else {
		current = view.Current
	}
	return map[string]any{
		"session_id":                     view.ID,
		"state":                          view.State,
		"conversation_language_mode":     view.Mode,
		"preferred_conversation_locale":  preferred,
		"current_locale":                 current,
		"provider":                       view.Provider,
		"elapsed_ms":                     time.Since(view.Created).Milliseconds(),
	}
}

func validLocale(code string) bool {
	for _, item := range language.LaunchCodes() {
		if string(item) == code {
			return true
		}
	}
	return false
}

func newID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	return hex.EncodeToString(buf[:])
}

func writeLine(w http.ResponseWriter, body map[string]any) error {
	for _, key := range []string{"text", "transcript"} {
		delete(body, key)
	}
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	return enc.Encode(body)
}

func writeJSON(w http.ResponseWriter, status int, body map[string]any) {
	for _, key := range []string{"text", "transcript"} {
		delete(body, key)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}
