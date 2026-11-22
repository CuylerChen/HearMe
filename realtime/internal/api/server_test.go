package api

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
)

func TestListenAddrIsLoopback(t *testing.T) {
    if ListenAddr != "127.0.0.1:18200" {
        t.Fatalf("listen addr %s", ListenAddr)
    }
}

func TestLanguagesAreLaunchSix(t *testing.T) {
    rec := httptest.NewRecorder()
    New().Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/languages", nil))
    if rec.Code != http.StatusOK {
        t.Fatalf("status %d", rec.Code)
    }
    var body struct {
        Languages []struct {
            Code string `json:"code"`
        } `json:"languages"`
    }
    if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
        t.Fatal(err)
    }
    got := make([]string, 0, len(body.Languages))
    for _, item := range body.Languages {
        got = append(got, item.Code)
    }
    want := []string{"en", "zh-CN", "ja", "ko", "es", "fr"}
    if strings.Join(got, ",") != strings.Join(want, ",") {
        t.Fatalf("languages %v", got)
    }
}

func TestCreateAndStatusOmitContent(t *testing.T) {
    srv := New()
    rec := httptest.NewRecorder()
    req := httptest.NewRequest(http.MethodPost, "/v1/sessions", strings.NewReader(`{}`))
    srv.Handler().ServeHTTP(rec, req)
    if rec.Code != http.StatusCreated {
        t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
    }
    var created map[string]any
    if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
        t.Fatal(err)
    }
    if created["conversation_language_mode"] != "auto" {
        t.Fatalf("mode %v", created["conversation_language_mode"])
    }
    id, _ := created["session_id"].(string)
    if id == "" {
        t.Fatal("missing session_id")
    }
    assertNoContentKeys(t, created)

    statusRec := httptest.NewRecorder()
    statusReq := httptest.NewRequest(http.MethodGet, "/v1/sessions/"+id, nil)
    srv.Handler().ServeHTTP(statusRec, statusReq)
    if statusRec.Code != http.StatusOK {
        t.Fatalf("status %d body %s", statusRec.Code, statusRec.Body.String())
    }
    var status map[string]any
    if err := json.Unmarshal(statusRec.Body.Bytes(), &status); err != nil {
        t.Fatal(err)
    }
    assertNoContentKeys(t, status)
    if status["session_id"] != id {
        t.Fatalf("status id %v", status["session_id"])
    }
}

func TestVoicesStayDisabledUntilQualityPass(t *testing.T) {
    rec := httptest.NewRecorder()
    New().Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/voices", nil))
    if rec.Code != http.StatusOK {
        t.Fatalf("status %d", rec.Code)
    }
    var body struct {
        Voices []struct {
            VoiceKey  string `json:"voice_key"`
            Languages []struct {
                Enabled bool `json:"enabled"`
            } `json:"languages"`
        } `json:"voices"`
    }
    if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
        t.Fatal(err)
    }
    if len(body.Voices) != 4 {
        t.Fatalf("voices %d", len(body.Voices))
    }
    for _, voice := range body.Voices {
        for _, lang := range voice.Languages {
            if lang.Enabled {
                t.Fatalf("%s enabled before quality pass", voice.VoiceKey)
            }
        }
    }
}

func TestTurnAudioDoesNotStickToStatus(t *testing.T) {
	srv := New()
	srv.Turn = func(sessionID string, pcm []byte, emit func(TurnEvent) error) error {
		return emit(TurnEvent{Locale: "en", SampleRate: 24000, LatencyMs: 10, Audio: []byte{1, 2, 3, 4}})
	}
	create := httptest.NewRecorder()
	srv.Handler().ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/v1/sessions", strings.NewReader(`{}`)))
	var created map[string]any
	if err := json.Unmarshal(create.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	id := created["session_id"].(string)
	turn := httptest.NewRecorder()
	body := `{"pcm16k_b64":"AAAA"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions/"+id+"/turns", strings.NewReader(body))
	srv.Handler().ServeHTTP(turn, req)
	if turn.Code != http.StatusOK {
		t.Fatalf("turn status %d %s", turn.Code, turn.Body.String())
	}
	if !strings.Contains(turn.Body.String(), "audio_b64") {
		t.Fatal("caller did not receive reply audio")
	}
	if strings.Contains(turn.Body.String(), "transcript") {
		t.Fatal("turn response included a transcript")
	}
	status := httptest.NewRecorder()
	srv.Handler().ServeHTTP(status, httptest.NewRequest(http.MethodGet, "/v1/sessions/"+id, nil))
	if strings.Contains(status.Body.String(), "audio_b64") || strings.Contains(status.Body.String(), "AAAA") {
		t.Fatalf("status kept audio: %s", status.Body.String())
	}
}

func assertNoContentKeys(t *testing.T, body map[string]any) {
    t.Helper()
    for _, key := range []string{"text", "transcript", "audio", "pcm_b64", "detected_history"} {
        if _, ok := body[key]; ok {
            t.Fatalf("response included %s", key)
        }
    }
}
