package session

import "testing"

func TestCancelDropsLaterFrames(t *testing.T) {
    s := New("s1")
    s.StartRequest("r1")
    if !s.WriteAudio("r1", []byte{1, 2, 3, 4}) {
        t.Fatal("first frame should be written")
    }
    s.Cancel("r1")
    if s.WriteAudio("r1", []byte{5, 6}) {
        t.Fatal("cancelled request wrote audio")
    }
    if s.WrittenFrames("r1") != 1 {
        t.Fatalf("frames=%d", s.WrittenFrames("r1"))
    }
}

func TestEmptyFinalDoesNotCallLLM(t *testing.T) {
    calls := 0
    s := New("s1")
    s.OnTurn = func(requestID, text, language string) {
        calls++
    }
    s.OnFinal("", "Chinese")
    s.OnFinal("   ", "English")
    if calls != 0 {
        t.Fatalf("llm calls=%d", calls)
    }
    s.OnFinal("hello", "English")
    if calls != 1 {
        t.Fatalf("llm calls=%d", calls)
    }
}

func TestSilenceDoesNotOpenAudioFile(t *testing.T) {
    s := New("s1")
    s.OnSpeechEnd("")
    if s.AudioFiles() != 0 {
        t.Fatal("silence created an audio file")
    }
}
