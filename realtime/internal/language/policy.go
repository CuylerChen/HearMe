package language

import "strings"

// Launch locales are the product six. Cantonese is recognized by the
// local model and is intentionally absent here so it cannot pass as Mandarin.
type LanguageCode string

const (
	LangEnglish  LanguageCode = "en"
	LangChinese  LanguageCode = "zh-CN"
	LangJapanese LanguageCode = "ja"
	LangKorean   LanguageCode = "ko"
	LangSpanish  LanguageCode = "es"
	LangFrench   LanguageCode = "fr"
)

type Mode string

const (
	ModeAuto      Mode = "auto"
	ModePreferred Mode = "preferred"
)

func LaunchCodes() []LanguageCode {
	return []LanguageCode{
		LangEnglish,
		LangChinese,
		LangJapanese,
		LangKorean,
		LangSpanish,
		LangFrench,
	}
}

var modelToProduct = map[string]LanguageCode{
	"Chinese":  LangChinese,
	"English":  LangEnglish,
	"Japanese": LangJapanese,
	"Korean":   LangKorean,
	"Spanish":  LangSpanish,
	"French":   LangFrench,
}

var productToModel = map[LanguageCode]string{
	LangEnglish:  "English",
	LangChinese:  "Chinese",
	LangJapanese: "Japanese",
	LangKorean:   "Korean",
	LangSpanish:  "Spanish",
	LangFrench:   "French",
}

func ProductCode(modelLanguage string) LanguageCode {
	return modelToProduct[strings.TrimSpace(modelLanguage)]
}

func ModelName(code LanguageCode) string {
	return productToModel[code]
}

type Policy struct {
	Mode            Mode
	Preferred       LanguageCode
	Current         LanguageCode
	MinConfidence   float32
	ConfirmSegments int
	MinSwitchMs     int
	pending         LanguageCode
	pendingCount    int
}

func New(mode Mode, preferred LanguageCode) *Policy {
	if mode == "" {
		mode = ModeAuto
	}
	p := &Policy{
		Mode:            mode,
		Preferred:       preferred,
		MinConfidence:   0.80,
		ConfirmSegments: 2,
		MinSwitchMs:     1500,
	}
	if mode == ModePreferred {
		p.Current = preferred
	}
	return p
}

func (p *Policy) Observe(modelLanguage string, confidence float32, durationMs int) (LanguageCode, bool) {
	if strings.Contains(modelLanguage, ",") {
		return p.currentOrPreferred(), false
	}
	code := ProductCode(modelLanguage)
	if code == "" || confidence < p.MinConfidence || durationMs < p.MinSwitchMs {
		p.pending = ""
		p.pendingCount = 0
		return p.currentOrPreferred(), false
	}
	if p.Current == "" {
		p.Current = code
		p.pending = ""
		p.pendingCount = 0
		return p.Current, true
	}
	if p.Current == code {
		p.pending = ""
		p.pendingCount = 0
		return p.Current, false
	}
	if p.pending == code {
		p.pendingCount++
	} else {
		p.pending = code
		p.pendingCount = 1
	}
	if p.pendingCount < p.ConfirmSegments {
		return p.currentOrPreferred(), false
	}
	p.Current = code
	p.pending = ""
	p.pendingCount = 0
	return p.Current, true
}

func (p *Policy) currentOrPreferred() LanguageCode {
	if p.Current != "" {
		return p.Current
	}
	if p.Mode == ModePreferred {
		return p.Preferred
	}
	return ""
}
