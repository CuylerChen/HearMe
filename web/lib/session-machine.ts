export type SessionStatus =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "reconnecting"
  | "connection_failed"
  | "ended";

export type SessionState = {
  status: SessionStatus;
  muted: boolean;
};

export type SessionEvent =
  | "request_permission"
  | "permission_granted"
  | "permission_denied"
  | "connect_ok"
  | "connect_fail"
  | "speech_end"
  | "audio_start"
  | "audio_end"
  | "user_speech"
  | "mute"
  | "unmute"
  | "retry"
  | "cancel"
  | "end"
  | "drop";

export function reduceSession(state: SessionState, event: SessionEvent): SessionState {
  if (event === "end") return { status: "ended", muted: false };
  if (event === "cancel") return { status: "idle", muted: false };
  if (event === "mute") return { ...state, muted: true };
  if (event === "unmute") return { ...state, muted: false };

  switch (state.status) {
    case "idle":
      if (event === "request_permission") return { status: "requesting_permission", muted: false };
      return state;
    case "requesting_permission":
      if (event === "permission_granted") return { status: "connecting", muted: false };
      return state;
    case "connecting":
    case "reconnecting":
      if (event === "connect_ok") return { status: "listening", muted: state.muted };
      if (event === "connect_fail") return { status: "connection_failed", muted: false };
      if (event === "retry") return { status: "connecting", muted: state.muted };
      return state;
    case "connection_failed":
      if (event === "retry") return { status: "connecting", muted: false };
      if (event === "speech_end") return { status: "processing", muted: state.muted };
      return state;
    case "listening":
      if (event === "speech_end" && !state.muted) return { ...state, status: "processing" };
      if (event === "drop") return { ...state, status: "reconnecting" };
      return state;
    case "processing":
      if (event === "audio_start") return { ...state, status: "speaking" };
      if (event === "audio_end" || event === "user_speech") return { ...state, status: "listening" };
      if (event === "drop") return { ...state, status: "reconnecting" };
      return state;
    case "speaking":
      if (event === "user_speech" || event === "audio_end") return { ...state, status: "listening" };
      if (event === "drop") return { ...state, status: "reconnecting" };
      return state;
    default:
      return state;
  }
}
