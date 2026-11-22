"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { preparedContext, unlockAudio } from "@/lib/audio-unlock";
import { base64ToPcm, downsampleTo16k, pcmToBase64 } from "@/lib/pcm";
import { reduceSession, type SessionEvent, type SessionState } from "@/lib/session-machine";
import { randomListener, type Listener } from "@/lib/listeners";
import { useApp } from "./AppState";

type Hold = {
  status: SessionState["status"];
  muted: boolean;
  sessionId: string;
  stream: MediaStream | null;
  context: AudioContext | null;
  sources: AudioBufferSourceNode[];
  abort: AbortController | null;
  speakingFor: number;
  silenceFor: number;
  voiced: boolean;
  chunks: Float32Array[];
  playing: boolean;
  nextTime: number;
  speechMs: number;
  ignoreUntil: number;
  listenerId: string;
};

export function VoiceSession() {
  const { t, user } = useApp();
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ status: "connecting", muted: false });
  const [notice, setNotice] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [person, setPerson] = useState<Listener | null>(null);
  const voiceName = user ? { gentle: t.gentle, calm: t.calm, warm: t.warm, thoughtful: t.thoughtful }[user.preferences.voiceKey] : t.gentle;
  const hold = useRef<Hold>({
    status: "connecting",
    muted: false,
    sessionId: "",
    stream: null,
    context: null,
    sources: [],
    abort: null,
    speakingFor: 0,
    silenceFor: 0,
    voiced: false,
    chunks: [],
    playing: false,
    nextTime: 0,
    speechMs: 0,
    ignoreUntil: 0,
    listenerId: "",
  });

  function dispatch(event: SessionEvent) {
    setState((current) => {
      const next = reduceSession(current, event);
      hold.current.status = next.status;
      hold.current.muted = next.muted;
      return next;
    });
  }

  useEffect(() => {
    let gone = false;
    connect();
    const onHide = () => {
      if (document.visibilityState === "hidden") release(false);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      gone = true;
      window.removeEventListener("pagehide", onHide);
      if (!gone) return;
      release(false);
    };
    // The call owns the microphone until End or page close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setNotice("");
    dispatch("request_permission");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error) {
      dispatch("permission_denied");
      const name = error instanceof DOMException ? error.name : "";
      setNotice(name === "NotAllowedError" ? t.micNeeded : t.micInUse);
      return;
    }
    hold.current.stream = stream;
    dispatch("permission_granted");
    const health = await fetch("/api/voice/health").then((response) => response.json()).catch(() => ({ ok: false }));
    if (!health.ok) {
      dispatch("connect_fail");
      setNotice(t.serviceUnavailable);
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const listener = randomListener();
    hold.current.listenerId = listener.id;
    setPerson(listener);
    const created = await fetch("/api/voice/sessions", { method: "POST" });
    if (!created.ok) {
      dispatch("connect_fail");
      setNotice(t.serviceUnavailable);
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const body = await created.json();
    hold.current.sessionId = body.session_id;
    dispatch("connect_ok");
    await capture(stream);
  }

  async function capture(stream: MediaStream) {
    const context = preparedContext() || new AudioContext();
    hold.current.context = context;
    if (context.state !== "running") await context.resume().catch(() => undefined);
    if (context.state !== "running") {
      setNeedsTap(true);
      return;
    }
    setNeedsTap(false);
    await context.audioWorklet.addModule("/pcm-worklet.js");
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "pcm-processor");
    const silent = context.createGain();
    silent.gain.value = 0;
    node.port.onmessage = (event) => onFrame(event.data as Float32Array, context.sampleRate);
    source.connect(node);
    node.connect(silent);
    silent.connect(context.destination);
  }

  function onFrame(input: Float32Array, sampleRate: number) {
    const rms = Math.sqrt(input.reduce((sum, sample) => sum + sample * sample, 0) / input.length);
    const frameMs = (input.length / sampleRate) * 1000;
    const live = hold.current;
    if (performance.now() < live.ignoreUntil) return;
    const threshold = live.playing ? 0.08 : 0.02;
    if (live.muted || live.status === "processing") return;
    if (rms > threshold) {
      live.silenceFor = 0;
      live.speakingFor += frameMs;
      live.speechMs += frameMs;
      live.chunks.push(new Float32Array(input));
      if (live.speakingFor > 280) {
        if (!live.voiced) setHearing(true);
        live.voiced = true;
        if (live.playing || live.status === "speaking") interrupt();
      }
    } else if (live.voiced) {
      live.silenceFor += frameMs;
      live.speakingFor = 0;
      live.chunks.push(new Float32Array(input));
      if (live.silenceFor > 700 && live.status === "listening" && live.speechMs >= 600) {
        const audio = merge(live.chunks);
        live.chunks = [];
        live.voiced = false;
        live.speechMs = 0;
        live.silenceFor = 0;
        setHearing(false);
        sendTurn(audio, sampleRate);
      }
      if (live.silenceFor > 700 && live.speechMs < 600) {
        live.chunks = [];
        live.voiced = false;
        live.speechMs = 0;
        live.silenceFor = 0;
        setHearing(false);
      }
    }
  }

  async function sendTurn(audio: Float32Array, sampleRate: number) {
    const pcm = downsampleTo16k(audio, sampleRate);
    if (pcm.length < 1600) return;
    dispatch("speech_end");
    const controller = new AbortController();
    hold.current.abort = controller;
    const response = await fetch(`/api/voice/sessions/${hold.current.sessionId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pcm16k_b64: pcmToBase64(pcm), listener_id: hold.current.listenerId }),
      signal: controller.signal,
    }).catch(() => null);
    if (!response || !response.ok || !response.body) {
      if (controller.signal.aborted) return;
      dispatch("connect_fail");
      setNotice(t.serviceUnavailable);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let started = false;
    while (true) {
      const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line) as { type?: string; audio_b64?: string; sample_rate?: number };
        if (message.type === "audio" && message.audio_b64 && hold.current.context) {
          if (!started) {
            started = true;
            dispatch("audio_start");
          }
          play(base64ToPcm(message.audio_b64), message.sample_rate || 24000);
        }
      }
    }
    if (!started) {
      dispatch("audio_end");
    }
  }

  function play(pcm: Int16Array, sampleRate: number) {
    const context = hold.current.context;
    if (!context) return;
    const audio = context.createBuffer(1, pcm.length, sampleRate);
    const channel = audio.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;
    const source = context.createBufferSource();
    source.buffer = audio;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, hold.current.nextTime);
    hold.current.nextTime = startAt + audio.duration;
    hold.current.playing = true;
    hold.current.sources.push(source);
    source.onended = () => {
      hold.current.sources = hold.current.sources.filter((item) => item !== source);
      if (hold.current.sources.length === 0) {
        hold.current.playing = false;
        hold.current.nextTime = 0;
        hold.current.ignoreUntil = performance.now() + 700;
        hold.current.chunks = [];
        hold.current.voiced = false;
        hold.current.speechMs = 0;
        if (hold.current.status === "speaking") dispatch("audio_end");
      }
    };
    source.start(startAt);
  }

  function stopPlayback() {
    hold.current.abort?.abort();
    hold.current.abort = null;
    for (const source of hold.current.sources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    hold.current.sources = [];
    hold.current.playing = false;
    hold.current.nextTime = 0;
  }

  function interrupt() {
    stopPlayback();
    dispatch("user_speech");
    const id = hold.current.sessionId;
    if (id) fetch(`/api/voice/sessions/${id}/interrupt`, { method: "POST" }).catch(() => undefined);
  }

  async function release(goEnd: boolean) {
    stopPlayback();
    hold.current.stream?.getTracks().forEach((track) => track.stop());
    hold.current.stream = null;
    const id = hold.current.sessionId;
    hold.current.sessionId = "";
    if (id) fetch(`/api/voice/sessions/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
    if (goEnd) router.push("/session/end");
  }

  const copy = state.muted
    ? t.muted
    : state.status === "listening"
      ? t.listening
      : state.status === "speaking"
        ? t.speaking
        : state.status === "processing"
          ? t.stillHere
          : state.status === "reconnecting"
            ? t.reconnecting
            : state.status === "connection_failed"
              ? t.couldntConnect
              : t.connecting;
  const detail = state.muted
    ? t.unmute
    : hearing
      ? t.heard
      : state.status === "listening"
        ? t.listeningBody
        : state.status === "speaking"
          ? ""
          : notice;

  const showWave = hearing || state.status === "listening" || state.status === "speaking";
  return (
    <section className="session phone">
      <header className="session-top">
        <span className="brand"><span className="ring" aria-hidden="true" />HearMe</span>
        <span className="voice-chip">{t.voiceLabel}: {voiceName}</span>
      </header>
      {state.status === "reconnecting" || state.status === "connection_failed" ? (
        <p className="banner">{t.interrupted}</p>
      ) : null}
      <div className="session-stage">
        <div className={`rings${state.status === "speaking" ? " speaking" : ""}${state.status === "listening" || hearing ? " live" : ""}`} aria-hidden="true">
          <span>{showWave ? <i className="wave"><b /><b /><b /><b /></i> : null}</span>
        </div>
        <h1>{copy}</h1>
        <p className="status-copy">{state.status === "connecting" ? t.readyTalk : state.status === "reconnecting" ? t.hangTight : detail || t.listeningBody}</p>
      </div>
      <div className="round-actions">
        {state.status === "connection_failed" || state.status === "requesting_permission" ? (
          <>
            <button className="button" type="button" onClick={() => connect()}>{t.retry}</button>
            <button className="button-secondary" type="button" onClick={() => setConfirmEnd(true)}>{t.end}</button>
          </>
        ) : (
          <>
            <button className="round" type="button" onClick={() => dispatch(state.muted ? "unmute" : "mute")} aria-pressed={state.muted}>
              <span className="round-face" aria-hidden="true"><MicIcon /></span>
              <span className="round-label">{state.muted ? t.unmute : t.mute}</span>
            </button>
            {state.status === "speaking" ? (
              <button className="round" type="button" onClick={() => { stopPlayback(); dispatch("audio_end"); }}>
                <span className="round-face" aria-hidden="true">Ⅱ</span>
                <span className="round-label">{t.pause}</span>
              </button>
            ) : null}
            <button className="round end" type="button" data-track="end_conversation" onClick={() => setConfirmEnd(true)}>
              <span className="round-face" aria-hidden="true">×</span>
              <span className="round-label">{t.end}</span>
            </button>
          </>
        )}
      </div>
      <p className="saved-line">✓ {t.connected} · {t.connectedSaved}</p>
      {needsTap ? (
        <div className="dialog-backdrop">
          <div className="dialog">
            <p>{t.tapToHear}</p>
            <button className="button" type="button" onClick={async () => { await unlockAudio(); if (hold.current.stream) capture(hold.current.stream); }}>{t.continue}</button>
          </div>
        </div>
      ) : null}
      {confirmEnd ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="end-title">
            <h2 id="end-title">{t.endTitle}</h2>
            <p>{t.endGone}</p>
            <button className="button big" type="button" onClick={() => setConfirmEnd(false)}>{t.continueTalking}</button>
            <button className="button-danger big" type="button" onClick={() => release(true)}>{t.endConversation}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MicIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>;
}

function merge(chunks: Float32Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
