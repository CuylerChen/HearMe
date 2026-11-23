package pipeline

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"hearme/realtime/internal/language"
)

type AudioChunk struct {
	Locale     string
	SampleRate int
	LatencyMs  int
	PCM        []byte
}

type Style struct {
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

type Message map[string]any

var (
	styleMu sync.Mutex
	styles  = map[string]Style{}
)

var (
	policyMu  sync.Mutex
	policies    = map[string]*language.Policy{}
	generations   sync.Map
	activeRequest sync.Map
)

func Feed(sessionID string, pcm []byte) {
	if len(pcm) == 0 || strings.TrimSpace(sessionID) == "" {
		return
	}
	_, _ = exchange(sock("asr"), Message{
		"type":       "audio",
		"session_id": sessionID,
		"pcm16k_b64": base64.StdEncoding.EncodeToString(pcm),
		"language":   "",
		"append":     true,
		"final":      false,
	}, 20*time.Second, "partial", "error")
}

func Run(sessionID string, pcm []byte, emit func(AudioChunk) error) error {
	return RunTurn(sessionID, pcm, false, emit)
}

func RunTurn(sessionID string, pcm []byte, appendAudio bool, emit func(AudioChunk) error) error {
	if strings.TrimSpace(sessionID) == "" {
		return nil
	}
	if len(pcm) == 0 && !appendAudio {
		return nil
	}
	started := time.Now()
	generation := nextGeneration(sessionID)
	messages, err := exchange(sock("asr"), Message{
		"type":       "audio",
		"session_id": sessionID,
		"pcm16k_b64": base64.StdEncoding.EncodeToString(pcm),
		"language":   "",
		"append":     appendAudio,
		"final":      true,
	}, 45*time.Second, "final", "error")
	if err != nil {
		return err
	}
	final := messages[len(messages)-1]
	text, _ := final["text"].(string)
	if strings.TrimSpace(text) == "" {
		return nil
	}
	detected, _ := final["language"].(string)
	policy := policyFor(sessionID)
	locale, _ := policy.Observe(detected, 0.95, pcmDurationMs(pcm))
	replyLanguage := language.SpeechLanguage(text, language.ModelName(locale))
	if replyLanguage == "" {
		replyLanguage = language.SpeechLanguage(text, detected)
	}
	requestID := sessionID + "-" + started.Format("150405.000")
	activeRequest.Store(sessionID, requestID)
	defer activeRequest.Delete(sessionID)
	return speakAsReady(sessionID, requestID, text, replyLanguage, string(locale), styleFor(sessionID), generation, started, emit)
}

func speakAsReady(sessionID, requestID, text, replyLanguage, locale string, style Style, generation int, started time.Time, emit func(AudioChunk) error) error {
	conn, err := net.DialTimeout("unix", sock("llm"), 5*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	if err := writeMsg(conn, Message{
		"type":           "generate",
		"request_id":     requestID,
		"session_id":     sessionID,
		"text":           text,
		"language":       replyLanguage,
		"persona":        true,
		"max_new_tokens": 32,
		"voice_key":      style.VoiceKey,
		"listen_more":    style.ListenMore,
		"ask_questions":  style.AskQuestions,
		"short":          style.Short,
		"gentle":         style.Gentle,
		"listener_id":    style.ListenerID,
		"listener_name":  style.ListenerName,
		"manner":         style.Manner,
	}); err != nil {
		return err
	}
	_ = conn.SetDeadline(time.Now().Add(45 * time.Second))
	sentences := make(chan string, 8)
	readErr := make(chan error, 1)
	go func() {
		defer close(sentences)
		reader := bufio.NewReader(conn)
		for {
			msg, err := readMsg(reader)
			if err != nil {
				readErr <- err
				return
			}
			if msg["type"] == "sentence" {
				sentence, _ := msg["text"].(string)
				if strings.TrimSpace(sentence) != "" {
					sentences <- sentence
				}
			}
			if msg["type"] == "done" || msg["type"] == "cancelled" {
				readErr <- nil
				return
			}
		}
	}()
	seq := 0
	var first time.Time
	for sentence := range sentences {
		if currentGeneration(sessionID) != generation {
			return nil
		}
		spoken := language.SpeechLanguage(sentence, replyLanguage)
		speaker := style.SpeakerZh
		if spoken == "English" || spoken == "French" || spoken == "Spanish" {
			speaker = style.SpeakerEn
		}
		raw, sampleRate, err := synthesize(requestID, sessionID, sentence, spoken, speaker, seq)
		if err != nil {
			return err
		}
		seq++
		if len(raw) == 0 {
			continue
		}
		if first.IsZero() {
			first = time.Now()
		}
		if err := emit(AudioChunk{
			Locale:     locale,
			SampleRate: sampleRate,
			LatencyMs:  int(first.Sub(started).Milliseconds()),
			PCM:        raw,
		}); err != nil {
			return err
		}
	}
	return <-readErr
}

func synthesize(requestID, sessionID, sentence, replyLanguage, voiceKey string, seq int) ([]byte, int, error) {
	chunks, err := exchange(sock("tts"), Message{
		"type":       "synthesize",
		"request_id": requestID,
		"session_id": sessionID,
		"text":       sentence,
		"language":   replyLanguage,
		"voice_key":  voiceKey,
		"speaker":    voiceKey,
		"seq":        seq,
	}, 60*time.Second, "done", "cancelled", "error")
	if err != nil {
		return nil, 0, err
	}
	var raw []byte
	sampleRate := 24000
	for _, msg := range chunks {
		if msg["type"] != "audio" {
			continue
		}
		encoded, _ := msg["pcm_b64"].(string)
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(decoded) == 0 {
			continue
		}
		raw = append(raw, decoded...)
		if rate := int(number(msg["sample_rate"])); rate > 0 {
			sampleRate = rate
		}
	}
	return raw, sampleRate, nil
}

func sentencesFrom(requestID, sessionID, text, replyLanguage string) ([]string, error) {
	messages, err := exchange(sock("llm"), Message{
		"type":           "generate",
		"request_id":     requestID,
		"session_id":     sessionID,
		"text":           text,
		"language":       replyLanguage,
		"persona":        true,
		"max_new_tokens": 48,
	}, 45*time.Second, "done", "cancelled")
	if err != nil {
		return nil, err
	}
	var sentences []string
	for _, msg := range messages {
		if msg["type"] != "sentence" {
			continue
		}
		sentence, _ := msg["text"].(string)
		if strings.TrimSpace(sentence) != "" {
			sentences = append(sentences, sentence)
		}
	}
	return sentences, nil
}

func writeMsg(conn net.Conn, msg Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	_, err = conn.Write(append(data, '\n'))
	return err
}

func readMsg(reader *bufio.Reader) (Message, error) {
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return nil, err
	}
	var msg Message
	if err := json.Unmarshal(line, &msg); err != nil {
		return nil, err
	}
	return msg, nil
}

func RememberStyle(sessionID string, style Style) {
	if style.VoiceKey == "" {
		style.VoiceKey = "gentle"
	}
	styleMu.Lock()
	styles[sessionID] = style
	styleMu.Unlock()
}

func styleFor(sessionID string) Style {
	styleMu.Lock()
	defer styleMu.Unlock()
	style, ok := styles[sessionID]
	if !ok {
		return Style{VoiceKey: "gentle", ListenMore: true, AskQuestions: true, Gentle: true}
	}
	return style
}

func Forget(sessionID string) {
	Reset(sessionID)
	styleMu.Lock()
	delete(styles, sessionID)
	styleMu.Unlock()
	conn, err := net.DialTimeout("unix", sock("llm"), 200*time.Millisecond)
	if err != nil {
		return
	}
	defer conn.Close()
	_ = writeMsg(conn, Message{"type": "forget", "session_id": sessionID})
}

func exchange(path string, request Message, timeout time.Duration, terminals ...string) ([]Message, error) {
	conn, err := net.DialTimeout("unix", path, 5*time.Second)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if err := writeMsg(conn, request); err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(timeout))
	reader := bufio.NewReader(conn)
	var messages []Message
	for {
		msg, err := readMsg(reader)
		if err != nil {
			return messages, err
		}
		messages = append(messages, msg)
		kind, _ := msg["type"].(string)
		for _, terminal := range terminals {
			if kind == terminal {
				return messages, nil
			}
		}
	}
}

func sock(name string) string {
	root := os.Getenv("HEARME_PREFIX")
	if root == "" {
		root = "/bigdata/hearme-ai"
	}
	return filepath.Join(root, "tmp", "realtime", name+".sock")
}

func pcmDurationMs(pcm []byte) int {
	samples := len(pcm) / 2
	if samples <= 0 {
		return 0
	}
	return samples * 1000 / 16000
}

func number(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	default:
		return 0
	}
}

func policyFor(sessionID string) *language.Policy {
	policyMu.Lock()
	defer policyMu.Unlock()
	if policies[sessionID] == nil {
		policies[sessionID] = language.New(language.ModeAuto, "")
	}
	return policies[sessionID]
}

func Interrupt(sessionID string) {
	nextGeneration(sessionID)
	go notifyCancel(sessionID)
}

func nextGeneration(sessionID string) int {
	next := 1
	if value, ok := generations.Load(sessionID); ok {
		next = value.(int) + 1
	}
	generations.Store(sessionID, next)
	return next
}

func currentGeneration(sessionID string) int {
	value, ok := generations.Load(sessionID)
	if !ok {
		return 0
	}
	return value.(int)
}

func notifyCancel(sessionID string) {
	requestID := sessionID
	if value, ok := activeRequest.Load(sessionID); ok {
		requestID = value.(string)
	}
	for _, name := range []string{"llm", "tts", "asr"} {
		conn, err := net.DialTimeout("unix", sock(name), 200*time.Millisecond)
		if err != nil {
			continue
		}
		payload, _ := json.Marshal(Message{"type": "cancel", "session_id": sessionID, "request_id": requestID})
		_, _ = conn.Write(append(payload, '\n'))
		conn.Close()
	}
}

func Reset(sessionID string) {
	policyMu.Lock()
	defer policyMu.Unlock()
	delete(policies, sessionID)
	generations.Delete(sessionID)
}
