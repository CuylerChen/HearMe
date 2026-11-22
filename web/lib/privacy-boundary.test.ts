import assert from "node:assert/strict";
import test from "node:test";
import { rejectContentFields } from "./privacy-boundary.ts";

test("mood payload cannot carry a note or transcript", () => {
  assert.equal(rejectContentFields({ date: "2026-11-22", level: 3 }), null);
  assert.equal(rejectContentFields({ date: "2026-11-22", level: 3, note: "today" }), "content_not_allowed");
  assert.equal(rejectContentFields({ transcript: "hello" }), "content_not_allowed");
});

test("preferences cannot store detected language history", () => {
  assert.equal(
    rejectContentFields({ conversationLanguageMode: "auto", detectedHistory: ["en"] }),
    "content_not_allowed",
  );
});
