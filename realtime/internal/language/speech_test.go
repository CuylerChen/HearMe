package language

import "testing"

func TestSpeechLanguageFollowsTheWords(t *testing.T) {
	if got := SpeechLanguage("今天有点累", "English"); got != "Chinese" {
		t.Fatalf("chinese text spoken as %s", got)
	}
	if got := SpeechLanguage("仕事がつらい", "Chinese"); got != "Japanese" {
		t.Fatalf("japanese text spoken as %s", got)
	}
	if got := SpeechLanguage("오늘 힘들었어", "Chinese"); got != "Korean" {
		t.Fatalf("korean text spoken as %s", got)
	}
	if got := SpeechLanguage("It followed you home.", "French"); got != "French" {
		t.Fatalf("latin text should keep fallback, got %s", got)
	}
}
