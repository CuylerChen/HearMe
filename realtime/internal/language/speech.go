package language

// SpeechLanguage picks the spoken language from the words themselves.
// An ASR language tag can disagree with the transcript; TTS must follow the words.
func SpeechLanguage(text, fallback string) string {
	han, kana, hangul, latin := 0, 0, 0, 0
	for _, r := range text {
		switch {
		case r >= 0x3040 && r <= 0x30FF:
			kana++
		case r >= 0xAC00 && r <= 0xD7AF:
			hangul++
		case r >= 0x4E00 && r <= 0x9FFF:
			han++
		case (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z'):
			latin++
		}
	}
	switch {
	case hangul > 0 && hangul >= han && hangul >= kana:
		return "Korean"
	case kana > 0:
		return "Japanese"
	case han > 0 && han >= latin:
		return "Chinese"
	case latin > 0:
		if fallback == "French" || fallback == "Spanish" || fallback == "English" {
			return fallback
		}
		return "English"
	default:
		if fallback != "" {
			return fallback
		}
		return "Chinese"
	}
}
