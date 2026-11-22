import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { rejectContentFields } from "./privacy-boundary";

const forbidden = ["text", "transcript", "audio", "pcm", "pcm_b64", "pcm16k_b64", "summary", "recording", "note", "detectedHistory", "detected_history", "languageHistory"];

export const CLICKS = [
  "start_talking",
  "login",
  "signup",
  "create_account",
  "continue_google",
  "change_voice",
  "save_mood",
  "privacy",
  "end_conversation",
] as const;

export const CONVERSIONS = [
  "signup_complete",
  "login_complete",
  "onboarding_complete",
  "session_start",
  "session_end",
  "mood_saved",
] as const;

const PAGES = new Set([
  "/",
  "/signup",
  "/login",
  "/privacy",
  "/terms",
  "/contact",
  "/home",
  "/session",
  "/session/end",
  "/settings",
  "/mood",
  "/account",
  "/onboarding",
  "/reset",
]);

const LOCALES = new Set(["en", "zh-CN", "ja", "ko", "es", "fr"]);

export type AnalyticsEvent = {
  at: string;
  visitor: string;
  type: "page" | "click" | "conversion";
  path: string;
  name: string;
  locale: string;
  device: "mobile" | "desktop";
  referrer: string;
  signedIn: boolean;
};

type Store = { events: AnalyticsEvent[] };

const filePath = path.join(process.cwd(), "data", "analytics.json");
const secretPath = path.join(process.cwd(), "data", "admin-secret");
let chain: Promise<unknown> = Promise.resolve();

export function normalizePath(value: string) {
  const pathOnly = value.split("?")[0]?.split("#")[0] || "/";
  if (pathOnly.length > 80 || pathOnly.includes("@")) return "";
  const cleaned = pathOnly.length > 1 ? pathOnly.replace(/\/$/, "") : pathOnly;
  return PAGES.has(cleaned) ? cleaned : "";
}

export function normalizeEvent(input: {
  type?: string;
  path?: string;
  name?: string;
  locale?: string;
  device?: string;
  referrer?: string;
}): { type: AnalyticsEvent["type"]; path: string; name: string; locale: string; device: AnalyticsEvent["device"]; referrer: string } | null {
  if (rejectContentFields(input) || forbidden.some((key) => key in input)) return null;
  const type = input.type === "page" || input.type === "click" || input.type === "conversion" ? input.type : null;
  if (!type) return null;
  const page = normalizePath(String(input.path || "/"));
  if (!page) return null;
  const name = type === "page" ? page : String(input.name || "");
  if (type === "click" && !CLICKS.includes(name as (typeof CLICKS)[number])) return null;
  if (type === "conversion" && !CONVERSIONS.includes(name as (typeof CONVERSIONS)[number])) return null;
  const locale = LOCALES.has(String(input.locale)) ? String(input.locale) : "en";
  const device = input.device === "mobile" ? "mobile" : "desktop";
  const referrer = normalizeReferrer(String(input.referrer || ""));
  return { type, path: page, name, locale, device, referrer };
}

export function normalizeReferrer(value: string) {
  if (!value || value === "direct") return "direct";
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (!host || host.length > 80 || host.includes(" ")) return "direct";
    return host;
  } catch {
    return "direct";
  }
}

function readStore(): Store {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Store;
    return { events: Array.isArray(parsed.events) ? parsed.events : [] };
  } catch {
    return { events: [] };
  }
}

function writeStore(store: Store) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(store));
  renameSync(tmp, filePath);
}

function update<T>(fn: (store: Store) => T): Promise<T> {
  const run = chain.then(() => {
    const store = readStore();
    const result = fn(store);
    writeStore(store);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function readCookie(header: string | null, name: string) {
  const match = header?.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function visitorCookie(id: string) {
  return `hearme_vid=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}

export function adminPassword() {
  const fromEnv = process.env.HEARME_ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(secretPath, "utf8").trim();
  } catch {
    return "";
  }
}

function adminToken(password: string) {
  return scryptSync(password, "hearme-admin", 32).toString("hex");
}

export function adminCookie(password: string) {
  return `hearme_admin=${adminToken(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`;
}

export function clearAdminCookie() {
  return "hearme_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function adminAllowed(cookieHeader: string | null) {
  const password = adminPassword();
  const given = readCookie(cookieHeader, "hearme_admin");
  if (!password || !given) return false;
  const expected = Buffer.from(adminToken(password), "hex");
  const actual = Buffer.from(given, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function checkAdminPassword(password: string) {
  const expected = adminPassword();
  if (!expected || !password) return false;
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function recordFromRequest(
  request: Request,
  input: { type: AnalyticsEvent["type"]; path?: string; name?: string; locale?: string; device?: string; referrer?: string },
) {
  if (readCookie(request.headers.get("cookie"), "hearme_admin")) return null;
  let referrer = input.referrer || "";
  try {
    const refHost = new URL(referrer).hostname.replace(/^www\./, "");
    const self = request.headers.get("host")?.split(":")[0]?.replace(/^www\./, "");
    const local = new Set(["localhost", "127.0.0.1"]);
    if (self && (refHost === self || (local.has(self) && local.has(refHost)))) referrer = "direct";
  } catch {
    referrer = input.referrer || "";
  }
  const normalized = normalizeEvent({ ...input, referrer });
  if (!normalized) return null;
  const existing = readCookie(request.headers.get("cookie"), "hearme_vid");
  const visitor = /^[a-f0-9]{16,64}$/.test(existing) ? existing : randomBytes(12).toString("hex");
  const signedIn = Boolean(readCookie(request.headers.get("cookie"), "hearme_session"));
  await update((store) => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    store.events = store.events.filter((event) => Date.parse(event.at) >= cutoff);
    const duplicate = store.events.some((event) => {
      return event.visitor === visitor
        && event.type === normalized.type
        && event.path === normalized.path
        && event.name === normalized.name
        && Date.now() - Date.parse(event.at) < 2000;
    });
    if (!duplicate) {
      store.events.push({
        at: new Date().toISOString(),
        visitor,
        signedIn,
        ...normalized,
      });
    }
    if (store.events.length > 20000) store.events = store.events.slice(-20000);
  });
  return existing ? null : visitorCookie(visitor);
}

export const funnelSteps = [
  { id: "landing", label: "访问首页", type: "page" as const, name: "/" },
  { id: "start", label: "点击开始说话", type: "click" as const, name: "start_talking" },
  { id: "signup_view", label: "打开注册页", type: "page" as const, name: "/signup" },
  { id: "signup", label: "创建账号", type: "conversion" as const, name: "signup_complete" },
  { id: "onboarding", label: "完成引导", type: "conversion" as const, name: "onboarding_complete" },
  { id: "call", label: "开始通话", type: "conversion" as const, name: "session_start" },
  { id: "end", label: "结束通话", type: "conversion" as const, name: "session_end" },
];

function matches(event: AnalyticsEvent, step: (typeof funnelSteps)[number]) {
  return event.type === step.type && (step.type === "page" ? event.path === step.name : event.name === step.name);
}

export function summarize(events: AnalyticsEvent[], days: number, now = Date.now()) {
  const since = now - days * 24 * 60 * 60 * 1000;
  const rows = events.filter((event) => Date.parse(event.at) >= since);
  const visitors = new Set(rows.map((event) => event.visitor));
  const pages = new Map<string, { views: number; visitors: Set<string> }>();
  const clicks = new Map<string, { count: number; visitors: Set<string> }>();
  const locales = new Map<string, Set<string>>();
  const referrers = new Map<string, Set<string>>();
  const devices = { mobile: new Set<string>(), desktop: new Set<string>() };
  const byVisitor = new Map<string, AnalyticsEvent[]>();
  const daily = new Map<string, { views: number; visitors: Set<string> }>();

  for (const event of rows) {
    const list = byVisitor.get(event.visitor) || [];
    list.push(event);
    byVisitor.set(event.visitor, list);
    devices[event.device].add(event.visitor);
    const localeSet = locales.get(event.locale) || new Set<string>();
    localeSet.add(event.visitor);
    locales.set(event.locale, localeSet);
    if (event.type === "page") {
      const page = pages.get(event.path) || { views: 0, visitors: new Set<string>() };
      page.views += 1;
      page.visitors.add(event.visitor);
      pages.set(event.path, page);
      const day = event.at.slice(0, 10);
      const bucket = daily.get(day) || { views: 0, visitors: new Set<string>() };
      bucket.views += 1;
      bucket.visitors.add(event.visitor);
      daily.set(day, bucket);
      const ref = referrers.get(event.referrer) || new Set<string>();
      ref.add(event.visitor);
      referrers.set(event.referrer, ref);
    }
    if (event.type === "click") {
      const click = clicks.get(event.name) || { count: 0, visitors: new Set<string>() };
      click.count += 1;
      click.visitors.add(event.visitor);
      clicks.set(event.name, click);
    }
  }

  const pageViews = rows.filter((event) => event.type === "page");
  const singlePage = [...byVisitor.values()].filter((list) => list.filter((event) => event.type === "page").length === 1).length;
  const viewed = [...byVisitor.values()].filter((list) => list.some((event) => event.type === "page")).length;

  const funnel = funnelSteps.map((step, index) => {
    const people = new Set<string>();
    for (const [visitor, list] of byVisitor) {
      const reached = funnelSteps.slice(0, index + 1).every((item) => list.some((event) => matches(event, item)));
      if (reached) people.add(visitor);
    }
    return { id: step.id, label: step.label, visitors: people.size };
  });
  const funnelWithRates = funnel.map((step, index) => {
    const first = funnel[0]?.visitors || 0;
    const prev = index === 0 ? step.visitors : funnel[index - 1]?.visitors || 0;
    return {
      ...step,
      fromStart: first ? Math.round((step.visitors / first) * 1000) / 10 : 0,
      fromPrevious: prev ? Math.round((step.visitors / prev) * 1000) / 10 : 0,
    };
  });

  const countNamed = (type: AnalyticsEvent["type"], name: string) => {
    const people = new Set(rows.filter((event) => event.type === type && event.name === name).map((event) => event.visitor));
    return people.size;
  };
  const landing = funnel[0]?.visitors || 0;
  const signups = countNamed("conversion", "signup_complete");
  const calls = countNamed("conversion", "session_start");
  const ends = countNamed("conversion", "session_end");

  const hints: string[] = [];
  for (let index = 1; index < funnelWithRates.length; index += 1) {
    const prev = funnelWithRates[index - 1];
    const current = funnelWithRates[index];
    if (prev.visitors >= 3 && current.fromPrevious < 40) {
      hints.push(`${prev.label} 到 ${current.label} 只留下 ${current.fromPrevious}%。这里最值得先改。`);
    }
  }
  if (!hints.length && visitors.size === 0) hints.push("还没有访问数据。打开首页走一遍，数字会记在这里。");

  return {
    days,
    visitors: visitors.size,
    pageViews: pageViews.length,
    clicks: rows.filter((event) => event.type === "click").length,
    bounce: viewed ? Math.round((singlePage / viewed) * 1000) / 10 : 0,
    devices: { mobile: devices.mobile.size, desktop: devices.desktop.size },
    pages: [...pages.entries()]
      .map(([pathName, value]) => ({ path: pathName, views: value.views, visitors: value.visitors.size }))
      .sort((a, b) => b.views - a.views),
    clicksByName: [...clicks.entries()]
      .map(([name, value]) => ({ name, count: value.count, visitors: value.visitors.size }))
      .sort((a, b) => b.count - a.count),
    locales: [...locales.entries()]
      .map(([locale, value]) => ({ locale, visitors: value.size }))
      .sort((a, b) => b.visitors - a.visitors),
    referrers: [...referrers.entries()]
      .map(([host, value]) => ({ host, visitors: value.size }))
      .sort((a, b) => b.visitors - a.visitors),
    daily: [...daily.entries()]
      .map(([date, value]) => ({ date, views: value.views, visitors: value.visitors.size }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    funnel: funnelWithRates,
    rates: {
      signupFromLanding: landing ? Math.round((signups / landing) * 1000) / 10 : 0,
      callFromSignup: signups ? Math.round((calls / signups) * 1000) / 10 : 0,
      endFromCall: calls ? Math.round((ends / calls) * 1000) / 10 : 0,
    },
    hints,
  };
}

export async function analyticsSummary(days: number) {
  const safeDays = days === 30 ? 30 : 7;
  const store = readStore();
  return summarize(store.events, safeDays);
}
