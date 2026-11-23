import assert from "node:assert/strict";
import test from "node:test";
import { LISTENERS, assignListener, anotherListener, listenerForCall, randomListener } from "./listeners.ts";

test("different users meet different listeners", () => {
  const ids = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => assignListener(id)));
  assert.ok(ids.size > 1);
});

test("the same user keeps the same listener", () => {
  assert.equal(assignListener("user-42"), assignListener("user-42"));
});

test("a new call can meet a different person", () => {
  const ids = new Set(Array.from({ length: 40 }, () => randomListener().id));
  assert.ok(ids.size > 1);
});

test("a call keeps the person it started with", () => {
  assert.equal(listenerForCall("lin", "chen").id, "lin");
  assert.equal(listenerForCall("", assignListener("user-42")).id, assignListener("user-42"));
});

test("someone else is a different person", () => {
  const first = LISTENERS[0].id;
  assert.notEqual(anotherListener(first), first);
});
