package session

import (
	"strings"
	"sync"
)

type TurnFunc func(requestID, text, language string)

type Session struct {
	ID     string
	OnTurn TurnFunc

	mu        sync.Mutex
	cancelled map[string]bool
	frames    map[string]int
	files     int
	seq       int
}

func New(id string) *Session {
	return &Session{
		ID:        id,
		cancelled: map[string]bool{},
		frames:    map[string]int{},
	}
}

func (s *Session) StartRequest(requestID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancelled[requestID] = false
}

func (s *Session) Cancel(requestID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancelled[requestID] = true
}

func (s *Session) WriteAudio(requestID string, pcm []byte) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelled[requestID] || len(pcm) == 0 {
		return false
	}
	s.frames[requestID]++
	return true
}

func (s *Session) WrittenFrames(requestID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.frames[requestID]
}

func (s *Session) OnFinal(text, language string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	s.mu.Lock()
	s.seq++
	requestID := s.ID + "-r"
	s.mu.Unlock()
	s.StartRequest(requestID)
	if s.OnTurn != nil {
		s.OnTurn(requestID, text, language)
	}
}

func (s *Session) OnSpeechEnd(text string) {
	if strings.TrimSpace(text) == "" {
		return
	}
	s.mu.Lock()
	s.files++
	s.mu.Unlock()
}

func (s *Session) AudioFiles() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.files
}
