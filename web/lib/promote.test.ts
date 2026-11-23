import assert from "node:assert/strict";
import test from "node:test";
import { guideByPath, guideJsonLd, guideMetadata, guides, hreflang, promoteLlmsBlock } from "./promote.ts";

const closed = ["/home", "/session", "/settings", "/mood", "/account", "/onboarding", "/reset", "/admin"];

function prose(path: string) {
  const guide = guideByPath(path);
  assert.ok(guide, path);
  return [guide.h1, guide.answer, guide.description, ...guide.sections.flatMap((item) => [item.heading, item.body]), ...guide.faqs.flatMap((item) => [item.question, item.answer])].join("\n");
}

test("night-talk guides quote HearMe in English and Chinese", () => {
  const english = prose("/listen");
  assert.match(english, /HearMe/);
  assert.match(english, /listens before/i);
  assert.match(english, /does not remember the last one/i);
  assert.match(english, /isn't therapy/i);

  const chinese = prose("/zh");
  assert.match(chinese, /HearMe/);
  assert.match(chinese, /先听/);
  assert.match(chinese, /不记得上一次/);
  assert.match(chinese, /不是治疗/);
});

test("promotion pages stay public and pair languages", () => {
  assert.deepEqual(guides.map((guide) => guide.path), ["/listen", "/zh"]);
  for (const guide of guides) {
    assert.equal(closed.includes(guide.path), false);
    assert.equal(guide.answer.length > 40 && guide.answer.length < 320, true);
  }
  assert.deepEqual(hreflang("/listen"), [
    { hreflang: "en", path: "/listen" },
    { hreflang: "zh-CN", path: "/zh" },
    { hreflang: "x-default", path: "/listen" },
  ]);
  assert.deepEqual(hreflang("/zh"), hreflang("/listen"));
});

test("answer engines get a quotable page and a direct answer", () => {
  const origin = "https://hearme.example";
  const block = promoteLlmsBlock(origin);
  assert.match(block, /https:\/\/hearme\.example\/listen/);
  assert.match(block, /https:\/\/hearme\.example\/zh/);
  assert.match(block, /does not remember the last one/);
  assert.match(block, /不记得上一次/);

  const metadata = guideMetadata(guideByPath("/zh")!, origin);
  assert.equal(metadata.alternates?.canonical, "/zh");
  assert.equal(metadata.robots && typeof metadata.robots === "object" && "index" in metadata.robots && metadata.robots.index, true);
  assert.equal(metadata.alternates?.languages?.["zh-CN"], "/zh");

  const graph = guideJsonLd(guideByPath("/listen")!, origin)["@graph"] as { "@type": string; url?: string }[];
  assert.equal(graph.some((item) => item["@type"] === "WebPage" && item.url === `${origin}/listen`), true);
  assert.equal(graph.some((item) => item["@type"] === "FAQPage"), true);
});
