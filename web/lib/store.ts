import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { rejectContentFields } from "./privacy-boundary";
import { assignListener, listenerFor } from "./listeners";
import { defaultPreferences, type Locale, type Preferences, type PublicUser, type VoiceKey, VOICES, LOCALES } from "./types";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  preferences: Preferences;
};

type Database = {
  users: UserRecord[];
  sessions: { id: string; userId: string }[];
  moods: { userId: string; date: string; level: number }[];
  resets: { email: string; codeHash: string; expires: number }[];
  feedback: { userId: string; rating: number; createdAt: string }[];
};

const dataDir = path.join(process.cwd(), "data");
const filePath = path.join(dataDir, "store.json");

let chain: Promise<unknown> = Promise.resolve();

function emptyDb(): Database {
  return { users: [], sessions: [], moods: [], resets: [], feedback: [] };
}

function readDb(): Database {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Database;
  } catch {
    return emptyDb();
  }
}

function writeDb(db: Database) {
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, filePath);
}

function update<T>(fn: (db: Database) => T): Promise<T> {
  const run = chain.then(() => {
    const db = readDb();
    const result = fn(db);
    writeDb(db);
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  return prev.length === next.length && timingSafeEqual(prev, next);
}

export function publicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, preferences: user.preferences };
}

export function readSessionUser(cookieHeader: string | null): Promise<PublicUser | null> {
  const id = readCookie(cookieHeader, "hearme_session");
  if (!id) return Promise.resolve(null);
  return update((db) => {
    const session = db.sessions.find((item) => item.id === id);
    const user = session && db.users.find((item) => item.id === session.userId);
    if (!user) return null;
    bindListener(user);
    return publicUser(user);
  });
}

export function signup(email: string, password: string, locale: Locale) {
  return update((db) => {
    const normalized = email.trim().toLowerCase();
    if (db.users.some((user) => user.email === normalized)) return { error: "email_taken" as const };
    const { salt, hash } = hashPassword(password);
    const user: UserRecord = {
      id: randomBytes(16).toString("hex"),
      email: normalized,
      passwordHash: hash,
      passwordSalt: salt,
      preferences: defaultPreferences(locale),
    };
    bindListener(user);
    db.users.push(user);
    const sessionId = randomBytes(24).toString("hex");
    db.sessions.push({ id: sessionId, userId: user.id });
    return { user: publicUser(user), sessionId };
  });
}

export function login(email: string, password: string) {
  return update((db) => {
    const user = db.users.find((item) => item.email === email.trim().toLowerCase());
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return { error: "invalid_login" as const };
    }
    const sessionId = randomBytes(24).toString("hex");
    db.sessions.push({ id: sessionId, userId: user.id });
    return { user: publicUser(user), sessionId };
  });
}

export function logout(cookieHeader: string | null) {
  const id = readCookie(cookieHeader, "hearme_session");
  return update((db) => {
    db.sessions = db.sessions.filter((item) => item.id !== id);
  });
}

export function savePreferences(cookieHeader: string | null, patch: Partial<Preferences>) {
  const rejected = rejectContentFields(patch);
  if (rejected) return Promise.resolve({ error: rejected });
  return update((db) => {
    const user = userFromCookie(db, cookieHeader);
    if (!user) return { error: "unauthorized" as const };
    user.preferences = sanitizePreferences({ ...user.preferences, ...patch });
    bindListener(user);
    return { user: publicUser(user) };
  });
}

export function listMoods(cookieHeader: string | null) {
  return update((db) => {
    const user = userFromCookie(db, cookieHeader);
    if (!user) return { error: "unauthorized" as const };
    return { moods: db.moods.filter((item) => item.userId === user.id).map(({ date, level }) => ({ date, level })) };
  });
}

export function saveMood(cookieHeader: string | null, date: string, level: number) {
  return update((db) => {
    const user = userFromCookie(db, cookieHeader);
    if (!user) return { error: "unauthorized" as const };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || level < 1 || level > 5) return { error: "invalid_mood" as const };
    const existing = db.moods.find((item) => item.userId === user.id && item.date === date);
    if (existing) existing.level = level;
    else db.moods.push({ userId: user.id, date, level });
    return { ok: true as const };
  });
}

export function deleteMood(cookieHeader: string | null, date: string) {
  return update((db) => {
    const user = userFromCookie(db, cookieHeader);
    if (!user) return { error: "unauthorized" as const };
    db.moods = db.moods.filter((item) => !(item.userId === user.id && item.date === date));
    return { ok: true as const };
  });
}

export function createReset(email: string) {
  return update((db) => {
    const normalized = email.trim().toLowerCase();
    const user = db.users.find((item) => item.email === normalized);
    if (!user) return { error: "not_found" as const };
    const code = randomBytes(3).toString("hex");
    const codeHash = scryptSync(code, "hearme-reset", 32).toString("hex");
    db.resets = db.resets.filter((item) => item.email !== normalized);
    db.resets.push({ email: normalized, codeHash, expires: Date.now() + 15 * 60 * 1000 });
    return { code, emailDelivery: "not_configured" as const };
  });
}

export function completeReset(email: string, code: string, password: string) {
  return update((db) => {
    const normalized = email.trim().toLowerCase();
    const reset = db.resets.find((item) => item.email === normalized);
    const codeHash = scryptSync(code, "hearme-reset", 32);
    const saved = reset ? Buffer.from(reset.codeHash, "hex") : Buffer.alloc(0);
    if (!reset || reset.expires < Date.now() || saved.length !== codeHash.length || !timingSafeEqual(saved, codeHash)) {
      return { error: "invalid_code" as const };
    }
    const user = db.users.find((item) => item.email === normalized);
    if (!user) return { error: "not_found" as const };
    const next = hashPassword(password);
    user.passwordSalt = next.salt;
    user.passwordHash = next.hash;
    db.resets = db.resets.filter((item) => item.email !== normalized);
    db.sessions = db.sessions.filter((item) => item.userId !== user.id);
    return { ok: true as const };
  });
}

export function saveFeedback(cookieHeader: string | null, rating: number) {
  return update((db) => {
    const user = userFromCookie(db, cookieHeader);
    if (!user) return { error: "unauthorized" as const };
    if (rating < 1 || rating > 5) return { error: "invalid_rating" as const };
    db.feedback.push({ userId: user.id, rating, createdAt: new Date().toISOString() });
    return { ok: true as const };
  });
}

export function deleteAccount(cookieHeader: string | null) {
  return update((db) => {
    const user = userFromCookie(db, cookieHeader);
    if (!user) return { error: "unauthorized" as const };
    db.users = db.users.filter((item) => item.id !== user.id);
    db.sessions = db.sessions.filter((item) => item.userId !== user.id);
    db.moods = db.moods.filter((item) => item.userId !== user.id);
    db.feedback = db.feedback.filter((item) => item.userId !== user.id);
    return { ok: true as const };
  });
}

function userFromCookie(db: Database, cookieHeader: string | null) {
  const id = readCookie(cookieHeader, "hearme_session");
  const session = id && db.sessions.find((item) => item.id === id);
  return session ? db.users.find((item) => item.id === session.userId) : undefined;
}

function readCookie(header: string | null, name: string) {
  if (!header) return "";
  const parts = header.split(";").map((item) => item.trim());
  const found = parts.find((item) => item.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

function bindListener(user: UserRecord) {
  const known = LISTENER_IDS.has(user.preferences.listenerId);
  if (!known) user.preferences.listenerId = assignListener(user.id);
  user.preferences.voiceKey = listenerFor(user.preferences.listenerId).voiceKey;
}

const LISTENER_IDS = new Set(["lin", "chen", "zhou", "su", "ye", "gu", "tang", "qiao"]);

function sanitizePreferences(value: Preferences): Preferences {
  const voiceKey = VOICES.includes(value.voiceKey) ? value.voiceKey : "gentle";
  const interfaceLocale = LOCALES.includes(value.interfaceLocale) ? value.interfaceLocale : "en";
  const preferred = value.preferredConversationLocale && LOCALES.includes(value.preferredConversationLocale)
    ? value.preferredConversationLocale
    : null;
  return {
    ...defaultPreferences(interfaceLocale),
    ...value,
    voiceKey: voiceKey as VoiceKey,
    interfaceLocale,
    preferredConversationLocale: preferred,
    conversationLanguageMode: value.conversationLanguageMode === "preferred" ? "preferred" : "auto",
    reminderEnabled: Boolean(value.reminderEnabled),
    reminderTime: /^\d{2}:\d{2}$/.test(value.reminderTime) ? value.reminderTime : "20:00",
    reminderDays: Array.isArray(value.reminderDays) ? value.reminderDays.filter((day) => typeof day === "string") : [],
  };
}

export function sessionCookie(sessionId: string) {
  return `hearme_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

export function clearCookie() {
  return "hearme_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}
