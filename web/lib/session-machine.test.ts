import assert from "node:assert/strict";
import test from "node:test";
import { reduceSession, type SessionEvent, type SessionState } from "./session-machine.ts";

const idle: SessionState = { status: "idle", muted: false };

function run(events: SessionEvent[], start: SessionState = idle) {
  return events.reduce(reduceSession, start);
}

test("start path reaches listening", () => {
  const state = run(["request_permission", "permission_granted", "connect_ok"]);
  assert.equal(state.status, "listening");
});

test("permission denial can retry or cancel", () => {
  const denied = run(["request_permission", "permission_denied"]);
  assert.equal(denied.status, "requesting_permission");
  assert.equal(reduceSession(denied, "cancel").status, "idle");
});

test("interrupt stops speaking and returns to listening", () => {
  const speaking = run(["request_permission", "permission_granted", "connect_ok", "speech_end", "audio_start"]);
  assert.equal(speaking.status, "speaking");
  assert.equal(reduceSession(speaking, "user_speech").status, "listening");
});

test("mute is not shown as listening", () => {
  const listening = run(["request_permission", "permission_granted", "connect_ok"]);
  const muted = reduceSession(listening, "mute");
  assert.equal(muted.muted, true);
  assert.equal(muted.status, "listening");
});

test("end clears the active call", () => {
  const listening = run(["request_permission", "permission_granted", "connect_ok"]);
  assert.equal(reduceSession(listening, "end").status, "ended");
});

test("empty turn returns to listening", () => {
  const processing = run(["request_permission", "permission_granted", "connect_ok", "speech_end"]);
  assert.equal(processing.status, "processing");
  assert.equal(reduceSession(processing, "audio_end").status, "listening");
});

test("connect failure can retry", () => {
  const failed = run(["request_permission", "permission_granted", "connect_fail"]);
  assert.equal(failed.status, "connection_failed");
  assert.equal(reduceSession(failed, "retry").status, "connecting");
});

test("a later turn can leave connection_failed", () => {
  const failed = run(["request_permission", "permission_granted", "connect_fail"]);
  assert.equal(reduceSession(failed, "speech_end").status, "processing");
});
