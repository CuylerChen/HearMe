package pipeline

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"log"
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
	Speaker      string
}

type Message map[string]any

var (
	styleMu sync.Mutex
	styles  = map[string]Style{}
)

var (
	policyMu      sync.Mutex
	policies      = map[string]*language.Policy{}
	generations   sync.Map
	activeRequest sync.Map
)

func Feed(sessionID string, pcm []byte) {
	if len(pcm) == 0 || strings.TrimSpace(sessionID) == "" {
		return
	}
	started := time.Now()
	_, err := exchange(sock("asr"), Message{
		"type":       "audio",
		"session_id": sessionID,
		"pcm16k_b64": base64.StdEncoding.EncodeToString(pcm),
		"language":   "",
		"append":     true,
		"final":      false,
	}, 2*time.Second, "partial", "error")
	log.Printf("event=partial ms=%d bytes=%d err=%t", time.Since(started).Milliseconds(), len(pcm), err != nil)
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
	asrStarted := time.Now()
	messages, err := exchange(sock("asr"), Message{
		"type":       "audio",
		"session_id": sessionID,
		"pcm16k_b64": base64.StdEncoding.EncodeToString(pcm),
		"language":   "",
		"append":     appendAudio,
		"final":      true,
	}, 12*time.Second, "final", "error")
	asrMs := time.Since(asrStarted).Milliseconds()
	if err != nil {
		log.Printf("event=turn asr_ms=%d err=asr", asrMs)
		return err
	}
	final := messages[len(messages)-1]
	text, _ := final["text"].(string)
	if strings.TrimSpace(text) == "" {
		log.Printf("event=turn asr_ms=%d empty=1 pcm_ms=%d total_ms=%d", asrMs, pcmDurationMs(pcm), time.Since(started).Milliseconds())
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
	var first time.Time
	wrapped := func(chunk AudioChunk) error {
		if first.IsZero() && len(chunk.PCM) > 0 {
			first = time.Now()
		}
		return emit(chunk)
	}
	reply, err := speakAsReady(sessionID, requestID, text, replyLanguage, string(locale), styleFor(sessionID), generation, started, wrapped)
	rememberExchange(sessionID, text, reply)
	warmAck(sessionID, replyLanguage)
	firstMs := int64(0)
	if !first.IsZero() {
		firstMs = first.Sub(started).Milliseconds()
	}
	log.Printf("event=turn asr_ms=%d first_ms=%d total_ms=%d err=%t", asrMs, firstMs, time.Since(started).Milliseconds(), err != nil)
	return err
}

func presenceLine(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case "english", "en":
		return "I'm here."
	case "japanese", "ja":
		return "いるよ。"
	case "korean", "ko":
		return "여기 있어."
	case "spanish", "es":
		return "Estoy aquí."
	case "french", "fr":
		return "Je suis là."
	default:
		return "我在。"
	}
}

func speakLine(sessionID, line, language string, started time.Time, emit func(AudioChunk) error) error {
	speaker := speakerForCall(sessionID, language)
	raw, sampleRate, err := synthesize(sessionID+"-presence", sessionID, line, language, speaker, 0)
	if err != nil || len(raw) == 0 {
		return err
	}
	return emit(AudioChunk{
		SampleRate: sampleRate,
		LatencyMs:  int(time.Since(started).Milliseconds()),
		PCM:        raw,
	})
}

func playAck(sessionID, language string, started time.Time, emit func(AudioChunk) error) {
	speaker := speakerForCall(sessionID, language)
	pcm, rate, ok := ackFor(speaker, language)
	if !ok || len(pcm) == 0 {
		return
	}
	_ = emit(AudioChunk{
		SampleRate: rate,
		LatencyMs:  int(time.Since(started).Milliseconds()),
		PCM:        pcm,
	})
}

func WarmSpeaker(speaker, language string) {
	if strings.TrimSpace(speaker) == "" {
		return
	}
	if _, _, ok := ackFor(speaker, language); ok {
		return
	}
	go func() {
		raw, rate, err := synthesize("warm-"+speaker, "warm", ackText(language), ackLanguage(language), speaker, 0)
		if err != nil || len(raw) == 0 {
			log.Printf("event=ack_warm speaker=%s err=1", speaker)
			return
		}
		storeAck(speaker, language, raw, rate)
		log.Printf("event=ack_warm speaker=%s bytes=%d", speaker, len(raw))
	}()
}

func speakAsReady(sessionID, requestID, text, replyLanguage, locale string, style Style, generation int, started time.Time, emit func(AudioChunk) error) (string, error) {
	conn, err := net.DialTimeout("unix", sock("llm"), 5*time.Second)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	history, said := priorContext(sessionID)
	if err := writeMsg(conn, Message{
		"type":           "generate",
		"request_id":     requestID,
		"session_id":     sessionID,
		"text":           text,
		"language":       replyLanguage,
		"persona":        true,
		"history":        history,
		"said":           said,
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
		return "", err
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
	var spokenLines []string
	for sentence := range sentences {
		spokenLines = append(spokenLines, sentence)
		if currentGeneration(sessionID) != generation {
			return strings.Join(spokenLines, ""), nil
		}
		spoken := language.SpeechLanguage(sentence, replyLanguage)
		speaker := speakerForCall(sessionID, spoken)
		raw, sampleRate, err := synthesize(requestID, sessionID, sentence, spoken, speaker, seq)
		if err != nil {
			return strings.Join(spokenLines, ""), err
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
			return strings.Join(spokenLines, ""), err
		}
	}
	return strings.Join(spokenLines, ""), <-readErr
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
	if strings.TrimSpace(sessionID) == "" {
		return
	}
	if style.VoiceKey == "" {
		style.VoiceKey = "gentle"
	}
	styleMu.Lock()
	defer styleMu.Unlock()
	if existing, ok := styles[sessionID]; ok && existing.ListenerID != "" {
		return
	}
	styles[sessionID] = style
}

type ackClip struct {
	pcm  []byte
	rate int
}

var ackCache sync.Map

func ackKey(speaker, language string) string {
	return speaker + "|" + ackLanguage(language)
}

func ackLanguage(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case "english", "en", "french", "fr", "spanish", "es":
		return "English"
	default:
		return "Chinese"
	}
}

func ackText(language string) string {
	if ackLanguage(language) == "English" {
		return "Mm."
	}
	return "嗯。"
}

func storeAck(speaker, language string, pcm []byte, rate int) {
	if speaker == "" || len(pcm) == 0 {
		return
	}
	ackCache.Store(ackKey(speaker, language), ackClip{pcm: append([]byte(nil), pcm...), rate: rate})
}

func ackFor(speaker, language string) ([]byte, int, bool) {
	value, ok := ackCache.Load(ackKey(speaker, language))
	if !ok {
		return nil, 0, false
	}
	clip := value.(ackClip)
	return clip.pcm, clip.rate, true
}

func warmAck(sessionID, language string) {
	speaker := speakerForCall(sessionID, language)
	if speaker == "" {
		return
	}
	if _, _, ok := ackFor(speaker, language); ok {
		return
	}
	go func() {
		raw, rate, err := synthesize("warm-"+speaker, sessionID, ackText(language), ackLanguage(language), speaker, 0)
		if err != nil || len(raw) == 0 {
			log.Printf("event=ack_warm speaker=%s err=1", speaker)
			return
		}
		storeAck(speaker, language, raw, rate)
		log.Printf("event=ack_warm speaker=%s bytes=%d", speaker, len(raw))
	}()
}

func knownSpeaker(name string) bool {
	switch name {
	case "Serena", "Vivian", "Uncle_Fu", "Dylan", "Eric", "Aiden", "Ryan":
		return true
	default:
		return false
	}
}

func speakerForCall(sessionID, spoken string) string {
	styleMu.Lock()
	defer styleMu.Unlock()
	style := styles[sessionID]
	if knownSpeaker(style.Speaker) {
		return style.Speaker
	}
	speaker := style.SpeakerZh
	if (spoken == "English" || spoken == "French" || spoken == "Spanish") && knownSpeaker(style.SpeakerEn) {
		speaker = style.SpeakerEn
	}
	if !knownSpeaker(speaker) {
		speaker = "Serena"
	}
	style.Speaker = speaker
	styles[sessionID] = style
	return speaker
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

func ProbeSpeech(sessionID string, pcm []byte) []map[string]any {
	if strings.TrimSpace(sessionID) == "" || len(pcm) == 0 {
		return []map[string]any{}
	}
	messages, err := exchange(sock("vad"), Message{
		"type":       "audio",
		"session_id": sessionID,
		"pcm16k_b64": base64.StdEncoding.EncodeToString(pcm),
	}, 2*time.Second, "done", "error")
	if err != nil && len(messages) == 0 {
		return nil
	}
	events := []map[string]any{}
	for _, msg := range messages {
		kind, _ := msg["type"].(string)
		if kind != "speech_start" && kind != "speech_end" {
			continue
		}
		events = append(events, map[string]any{"type": kind, "t_ms": msg["t_ms"]})
	}
	return events
}

func resetSpeech(sessionID string) {
	conn, err := net.DialTimeout("unix", sock("vad"), 200*time.Millisecond)
	if err != nil {
		return
	}
	defer conn.Close()
	_ = writeMsg(conn, Message{"type": "reset", "session_id": sessionID})
}

type callThread struct {
	turns []map[string]string
	said  []string
}

var (
	threadMu sync.Mutex
	threads  = map[string]*callThread{}
)

func priorContext(sessionID string) ([]map[string]string, []string) {
	threadMu.Lock()
	defer threadMu.Unlock()
	thread := threads[sessionID]
	if thread == nil {
		return []map[string]string{}, []string{}
	}
	turns := append([]map[string]string{}, thread.turns...)
	said := append([]string{}, thread.said...)
	return turns, said
}

func rememberExchange(sessionID, userText, reply string) {
	userText = strings.TrimSpace(userText)
	reply = strings.TrimSpace(reply)
	if sessionID == "" || (userText == "" && reply == "") {
		return
	}
	threadMu.Lock()
	defer threadMu.Unlock()
	thread := threads[sessionID]
	if thread == nil {
		thread = &callThread{}
		threads[sessionID] = thread
	}
	if userText != "" {
		clip := []rune(userText)
		if len(clip) > 180 {
			clip = clip[:180]
		}
		thread.said = append(thread.said, string(clip))
		if len(thread.said) > 24 {
			thread.said = thread.said[len(thread.said)-24:]
		}
		thread.turns = append(thread.turns, map[string]string{"role": "user", "content": userText})
	}
	if reply != "" {
		thread.turns = append(thread.turns, map[string]string{"role": "assistant", "content": reply})
	}
	if len(thread.turns) > 48 {
		thread.turns = thread.turns[len(thread.turns)-48:]
	}
}

func dropThread(sessionID string) {
	threadMu.Lock()
	delete(threads, sessionID)
	threadMu.Unlock()
}

func Forget(sessionID string) {
	Reset(sessionID)
	styleMu.Lock()
	delete(styles, sessionID)
	styleMu.Unlock()
	dropThread(sessionID)
	resetSpeech(sessionID)
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
