package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"hearme/realtime/internal/api"
	"hearme/realtime/internal/pipeline"
)

func main() {
	if api.ListenAddr != "127.0.0.1:18200" {
		log.Fatal("gateway bind must stay 127.0.0.1:18200")
	}
	srv := api.New()
	srv.OnInterrupt = pipeline.Interrupt
	srv.OnForget = pipeline.Forget
	srv.OnFeed = pipeline.Feed
	srv.OnStyle = func(sessionID string, style api.TurnStyle) {
		pipeline.RememberStyle(sessionID, pipeline.Style{
			VoiceKey:     style.VoiceKey,
			ListenMore:   style.ListenMore,
			AskQuestions: style.AskQuestions,
			Short:        style.Short,
			Gentle:       style.Gentle,
			ListenerID:   style.ListenerID,
			ListenerName: style.ListenerName,
			Manner:       style.Manner,
			SpeakerZh:    style.SpeakerZh,
			SpeakerEn:    style.SpeakerEn,
		})
	}
	srv.Turn = func(sessionID string, pcm []byte, appendAudio bool, emit func(api.TurnEvent) error) error {
		return pipeline.RunTurn(sessionID, pcm, appendAudio, func(chunk pipeline.AudioChunk) error {
			return emit(api.TurnEvent{
				Locale:     chunk.Locale,
				SampleRate: chunk.SampleRate,
				LatencyMs:  chunk.LatencyMs,
				Audio:      chunk.PCM,
			})
		})
	}
	server := &http.Server{
		Addr:    api.ListenAddr,
		Handler: api.Protect(withLabPage(srv.Handler())),
	}
	log.Printf("event=listen bind=%s", api.ListenAddr)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func withLabPage(next http.Handler) http.Handler {
	web := labDir()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/lab" {
			http.ServeFile(w, r, filepath.Join(web, "index.html"))
			return
		}
		if strings.HasPrefix(r.URL.Path, "/v1/") || r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})
}

func labDir() string {
	root := os.Getenv("HEARME_PREFIX")
	if root == "" {
		root = "/bigdata/hearme-ai"
	}
	return filepath.Join(root, "realtime", "web")
}
