import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvent, normalizePath, summarize, type AnalyticsEvent } from "./analytics.ts";

test("analytics keeps only known pages and feature names", () => {
  assert.equal(normalizePath("/signup?email=a@b.com"), "/signup");
  assert.equal(normalizePath("/secret-note"), "");
  assert.equal(normalizeEvent({ type: "click", path: "/", name: "start_talking" })?.name, "start_talking");
  assert.equal(normalizeEvent({ type: "click", path: "/", name: "I feel sad" }), null);
  assert.equal(normalizeEvent({ type: "page", path: "/home", transcript: "hello" }), null);
});

test("ordered funnel counts only visitors who reached every earlier step", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  const events: AnalyticsEvent[] = [
    event("a", "page", "/", "/", now),
    event("a", "click", "/", "start_talking", now),
    event("a", "page", "/signup", "/signup", now),
    event("a", "conversion", "/signup", "signup_complete", now),
    event("b", "page", "/", "/", now),
    event("b", "conversion", "/signup", "signup_complete", now),
  ];
  const summary = summarize(events, 7, now);
  assert.equal(summary.funnel[0].visitors, 2);
  assert.equal(summary.funnel[3].visitors, 1);
  assert.equal(summary.rates.signupFromLanding, 100);
});

function event(visitor: string, type: AnalyticsEvent["type"], path: string, name: string, now: number): AnalyticsEvent {
  return {
    at: new Date(now).toISOString(),
    visitor,
    type,
    path,
    name,
    locale: "en",
    device: "desktop",
    referrer: "direct",
    signedIn: false,
  };
}
