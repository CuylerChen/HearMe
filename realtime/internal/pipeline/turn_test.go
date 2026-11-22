package pipeline

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
)

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
