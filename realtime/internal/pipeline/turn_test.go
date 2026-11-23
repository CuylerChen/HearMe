package pipeline

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestCallThreadSurvivesUntilHangup(t *testing.T) {
	rememberExchange("thread", "今天被领导当众说了一顿", "当众那一下挺难堪的。")
	history, said := priorContext("thread")
	if len(history) != 2 || history[0]["content"] != "今天被领导当众说了一顿" {
		t.Fatalf("history %+v", history)
	}
	if len(said) != 1 || said[0] != "今天被领导当众说了一顿" {
		t.Fatalf("said %+v", said)
	}
	Forget("thread")
	history, said = priorContext("thread")
	if len(history) != 0 || len(said) != 0 {
		t.Fatalf("thread survived hangup %+v %+v", history, said)
	}
}

func TestOneCallKeepsTheSamePersonAndVoice(t *testing.T) {
	Forget("lock")
	t.Cleanup(func() { Forget("lock") })
	RememberStyle("lock", Style{
		ListenerID: "lin", ListenerName: "林晚", VoiceKey: "gentle",
		SpeakerZh: "Serena", SpeakerEn: "Aiden",
	})
	RememberStyle("lock", Style{
		ListenerID: "chen", ListenerName: "陈舒", VoiceKey: "warm",
		SpeakerZh: "Vivian", SpeakerEn: "Ryan",
	})
	got := styleFor("lock")
	if got.ListenerID != "lin" || got.ListenerName != "林晚" || got.SpeakerZh != "Serena" {
		t.Fatalf("person changed: %+v", got)
	}
	if speaker := speakerForCall("lock", "Chinese"); speaker != "Serena" {
		t.Fatalf("first speaker = %s", speaker)
	}
	RememberStyle("lock-voice", Style{ListenerID: "lin", VoiceKey: "gentle"})
	if speaker := speakerForCall("lock-voice", "Chinese"); speaker != "Serena" {
		t.Fatalf("voice key used as speaker: %s", speaker)
	}
	Forget("lock-voice")
	if speaker := speakerForCall("lock", "English"); speaker != "Serena" {
		t.Fatalf("voice changed mid-call to %s", speaker)
	}
}

func TestEmptyTranscriptDoesNotSpeakPresence(t *testing.T) {
	root, err := os.MkdirTemp("/tmp", "hm")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(root) })
	os.Setenv("HEARME_PREFIX", root)
	t.Cleanup(func() { os.Unsetenv("HEARME_PREFIX") })
	dir := filepath.Join(root, "tmp", "realtime")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	llmCalled := false
	var spoken string
	serve(t, filepath.Join(dir, "asr.sock"), func(msg Message) []Message {
		return []Message{{"type": "final", "session_id": msg["session_id"], "text": "", "language": "Chinese"}}
	})
	serve(t, filepath.Join(dir, "llm.sock"), func(msg Message) []Message {
		llmCalled = true
		return []Message{{"type": "done", "request_id": msg["request_id"]}}
	})
	serve(t, filepath.Join(dir, "tts.sock"), func(msg Message) []Message {
		spoken, _ = msg["text"].(string)
		return []Message{
			{"type": "audio", "pcm_b64": "AQI=", "sample_rate": 24000},
			{"type": "done"},
		}
	})
	t.Cleanup(func() { Forget("present") })
	RememberStyle("present", Style{ListenerID: "lin", SpeakerZh: "Serena", VoiceKey: "gentle"})
	llmCalled = false
	pcm := make([]byte, 16000*2) // one second
	var got int
	if err := RunTurn("present", pcm, false, func(chunk AudioChunk) error {
		got += len(chunk.PCM)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if llmCalled {
		t.Fatal("empty transcript called the LLM")
	}
	if spoken != "" || got != 0 {
		t.Fatalf("empty transcript spoke=%q audio=%d", spoken, got)
	}
}

func TestEmptyFinalDoesNotCallLLM(t *testing.T) {
	root, err := os.MkdirTemp("/tmp", "hm")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(root) })
	os.Setenv("HEARME_PREFIX", root)
	t.Cleanup(func() { os.Unsetenv("HEARME_PREFIX") })
	dir := filepath.Join(root, "tmp", "realtime")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	llmCalled := false
	serve(t, filepath.Join(dir, "asr.sock"), func(msg Message) []Message {
		return []Message{{"type": "final", "session_id": msg["session_id"], "text": "", "language": "Chinese"}}
	})
	serve(t, filepath.Join(dir, "llm.sock"), func(msg Message) []Message {
		llmCalled = true
		return []Message{{"type": "done", "request_id": msg["request_id"]}}
	})
	if err := Run("s1", []byte{1, 2, 3, 4}, func(AudioChunk) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if llmCalled {
		t.Fatal("empty transcript called the LLM")
	}
}

func serve(t *testing.T, path string, handle func(Message) []Message) {
	t.Helper()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	ln, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				reader := bufio.NewReader(conn)
				line, err := reader.ReadBytes('\n')
				if err != nil {
					return
				}
				var msg Message
				if err := json.Unmarshal(line, &msg); err != nil {
					return
				}
				for _, reply := range handle(msg) {
					data, _ := json.Marshal(reply)
					_, _ = conn.Write(append(data, '\n'))
				}
			}(conn)
		}
	}()
}
