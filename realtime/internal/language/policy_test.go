package language

import "testing"

func TestCantoneseDoesNotCountAsMandarin(t *testing.T) {
    p := New(ModeAuto, "")
    got, switched := p.Observe("Cantonese", 0.99, 3000)
    if switched || got == LangChinese {
        t.Fatalf("cantonese mapped into launch chinese: %s switched=%v", got, switched)
    }
    if ProductCode("Cantonese") != "" {
        t.Fatal("cantonese must not be a launch locale")
    }
}

func TestShortForeignWordDoesNotSwitch(t *testing.T) {
    p := New(ModeAuto, "")
    p.Observe("Chinese", 0.95, 2000)
    p.Observe("Chinese", 0.95, 2000)
    got, switched := p.Observe("English", 0.95, 400)
    if switched || got != LangChinese {
        t.Fatalf("short english switched the reply language: %s %v", got, switched)
    }
}

func TestTwoConfidentSegmentsSwitchOnNextReply(t *testing.T) {
    p := New(ModeAuto, "")
    p.Observe("Chinese", 0.95, 2000)
    p.Observe("Chinese", 0.95, 2000)
    if _, switched := p.Observe("English", 0.91, 1800); switched {
        t.Fatal("first english segment must not switch yet")
    }
    got, switched := p.Observe("English", 0.93, 1800)
    if !switched || got != LangEnglish {
        t.Fatalf("expected switch to en, got %s switched=%v", got, switched)
    }
}

func TestLowConfidenceKeepsCurrent(t *testing.T) {
    p := New(ModeAuto, "")
    p.Observe("Chinese", 0.95, 2000)
    p.Observe("Chinese", 0.95, 2000)
    got, switched := p.Observe("French", 0.40, 2500)
    if switched || got != LangChinese {
        t.Fatalf("low confidence changed language: %s %v", got, switched)
    }
}

func TestPreferredFillsUnknown(t *testing.T) {
    p := New(ModePreferred, LangJapanese)
    got, _ := p.Observe("Cantonese", 0.2, 200)
    if got != LangJapanese {
        t.Fatalf("preferred locale not used while uncertain, got %s", got)
    }
}

func TestMixedTagDoesNotSwitch(t *testing.T) {
    p := New(ModeAuto, "")
    p.Observe("Chinese", 0.95, 2000)
    p.Observe("Chinese", 0.95, 2000)
    got, switched := p.Observe("Chinese,English", 0.99, 2500)
    if switched || got != LangChinese {
        t.Fatalf("mixed tag switched language: %s %v", got, switched)
    }
}

func TestFirstConfidentUtteranceSetsLanguage(t *testing.T) {
    p := New(ModeAuto, "")
    got, switched := p.Observe("Chinese", 0.92, 2000)
    if !switched || got != LangChinese {
        t.Fatalf("first utterance did not set zh-CN: %s %v", got, switched)
    }
    got, switched = p.Observe("English", 0.95, 2000)
    if switched || got != LangChinese {
        t.Fatalf("single switch fragment changed language: %s %v", got, switched)
    }
}

func TestLaunchSix(t *testing.T) {
    got := LaunchCodes()
    want := []LanguageCode{LangEnglish, LangChinese, LangJapanese, LangKorean, LangSpanish, LangFrench}
    if len(got) != len(want) {
        t.Fatalf("launch count %d", len(got))
    }
    for i := range want {
        if got[i] != want[i] {
            t.Fatalf("launch[%d]=%s", i, got[i])
        }
    }
}
