/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Все права сохранены. */
import { env } from "cloudflare:workers";
import { z } from "zod";
import { database, initialize } from "./store";
import { hash, limit, ServiceError } from "./security";
import { LIVE_OWNER } from "./access";
import type { Candidate } from "../types";

export const PUBLIC_SESSION_COOKIE = "profectium_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 100000;
export const publicAuthEnabled = () =>
  (env as unknown as { PUBLIC_DEMO_AUTH?: string }).PUBLIC_DEMO_AUTH === "true";

export type PublicUser = {
  userId: string;
  email: string;
  fullName: string;
  displayName: string;
  role: "candidate" | "employer";
  guest: boolean;
};
type UserRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string | null;
  role: "candidate" | "employer";
  guest: number;
};
const email = z.string().trim().email().max(150).transform((s) => s.toLowerCase());
const registration = z.object({
  email,
  fullName: z.string().trim().min(2).max(80),
  password: z.string().min(6).max(128),
  role: z.enum(["candidate", "employer"]),
}).strict();
const login = z.object({ email, password: z.string().min(1).max(128) }).strict();
const hex = (bytes: Uint8Array) => [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("");
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const asPublicUser = (row: UserRow): PublicUser => ({
  userId: row.id, email: row.email, fullName: row.full_name,
  displayName: row.full_name, role: row.role, guest: row.guest === 1,
});

async function derivePassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", iterations: PASSWORD_ITERATIONS,
    salt: new TextEncoder().encode(salt),
  }, key, 256)));
}
export async function hashPassword(password: string) {
  const salt = randomToken();
  return `pbkdf2-sha256:${PASSWORD_ITERATIONS}:${salt}:${await derivePassword(password, salt)}`;
}
export async function verifyPassword(password: string, encoded: string | null) {
  if (!encoded) return false;
  const [algorithm, iterations, salt, expected] = encoded.split(":");
  if (algorithm !== "pbkdf2-sha256" || Number(iterations) !== PASSWORD_ITERATIONS || !/^[a-f0-9]{64}$/.test(salt ?? "") || !/^[a-f0-9]{64}$/.test(expected ?? "")) return false;
  const actual = await derivePassword(password, salt);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
export function sessionToken(requestHeaders: Headers) {
  const token = requestHeaders.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(PUBLIC_SESSION_COOKIE + "="))?.slice(PUBLIC_SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function publicUser(requestHeaders: Headers): Promise<PublicUser | null> {
  if (!publicAuthEnabled()) return null;
  const token = sessionToken(requestHeaders);
  if (!token) return null;
  const row = await database().prepare(
    "SELECT u.id,u.email,u.full_name,u.role,u.guest FROM public_users u JOIN public_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
  ).bind(await hash(token), new Date().toISOString()).first<UserRow>();
  return row ? asPublicUser(row) : null;
}
async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await database().batch([
    database().prepare("DELETE FROM public_sessions WHERE expires_at<=?").bind(new Date().toISOString()),
    database().prepare("INSERT INTO public_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hash(token), userId, expiresAt),
  ]);
  return token;
}
export async function revokeSession(requestHeaders: Headers) {
  const token = sessionToken(requestHeaders);
  if (token) await database().prepare("DELETE FROM public_sessions WHERE token_hash=?").bind(await hash(token)).run();
}
export function sessionCookie(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${PUBLIC_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure}`;
}
export function safeAuthReturn(value: string | null | undefined, fallback = "/?mode=live") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://profectium.local");
    if (url.origin !== "https://profectium.local" || /^\/(signin|register|signout|api\/auth)(\/|$)/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

async function seedSharedOrganization() {
  await initialize(LIVE_OWNER);
  const owner = "live:public-demo-organization";
  const db = database();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) VALUES(?,'employer','','team@orbita.example','Орбита · демокомпания','',0)").bind(owner),
    db.prepare("INSERT OR IGNORE INTO companies(owner,data) SELECT ?,data FROM companies WHERE owner=?").bind(owner, LIVE_OWNER),
    db.prepare("UPDATE jobs SET employer_id=? WHERE owner=? AND employer_id='' AND digest='seed'").bind(owner, LIVE_OWNER),
    db.prepare("UPDATE offers SET employer_id=? WHERE owner=? AND employer_id='' AND digest='seed'").bind(owner, LIVE_OWNER),
  ]);
}

export async function registerPublicUser(input: unknown) {
  const form = registration.parse(input);
  const db = database();
  if (await db.prepare("SELECT id FROM public_users WHERE email=?").bind(form.email).first() ||
      await db.prepare("SELECT owner FROM members WHERE email=?").bind(form.email).first())
    throw new ServiceError(409, "Этот email уже зарегистрирован. Войдите или укажите другой тестовый адрес.");
  const id = "public:" + crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const owner = "live:" + id;
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(form.password);
  const profile: Candidate = {
    id: candidateId, fullName: form.fullName,
    initials: form.fullName.split(/\s+/).slice(0, 2).map((n) => n[0]).join(""),
    role: "Frontend", grade: "Junior", city: "Москва", workFormat: "Удалённо",
    salaryMin: 80000, salaryMax: 120000, yearsExperience: 0,
    skills: ["Укажите навыки"], softSkills: [],
    bio: "Расскажите о ваших проектах, задачах и результатах.", achievements: [],
    available: false, contact: form.email, fspId: "",
    privacy: { processing: true, publication: false, showAchievements: false, consentAt: now },
  };
  // The personal demo is seeded on first access by /api/v1/state.
  // Avoid initializing two complete spaces in a single free Worker invocation.
  await seedSharedOrganization();
  const statements = [
    db.prepare("INSERT INTO public_users(id,email,full_name,password_hash,role,guest,created_at) VALUES(?,?,?,?,?,0,?)")
      .bind(id, form.email, form.fullName, passwordHash, form.role, now),
    // An empty verified_at explicitly records that this demonstration does not verify email.
    db.prepare("INSERT INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) VALUES(?,?,?,?,?,'',0)")
      .bind(owner, form.role, form.role === "candidate" ? candidateId : "", form.email, form.fullName),
  ];
  if (form.role === "candidate") statements.push(
    db.prepare("INSERT INTO candidates(owner,id,data,revision) VALUES(?,?,?,0)").bind(LIVE_OWNER, candidateId, JSON.stringify(profile)),
  );
  else statements.push(
    db.prepare("INSERT INTO companies(owner,data) VALUES(?,?)").bind(owner, JSON.stringify({
      name: form.fullName, industry: "ИТ", description: "Заполните информацию о компании и команде.", contact: form.email,
    })),
  );
  try { await db.batch(statements); }
  catch (error) {
    if (await db.prepare("SELECT id FROM public_users WHERE email=?").bind(form.email).first() ||
        await db.prepare("SELECT owner FROM members WHERE email=?").bind(form.email).first())
      throw new ServiceError(409, "Этот email уже зарегистрирован. Войдите или укажите другой тестовый адрес.");
    throw error;
  }
  return { user: asPublicUser({ id, email: form.email, full_name: form.fullName, password_hash: null, role: form.role, guest: 0 }), token: await createSession(id) };
}
export async function loginPublicUser(input: unknown) {
  const form = login.parse(input);
  await limit("public-login:" + await hash(form.email), 30, 10 * 60000);
  const row = await database().prepare("SELECT * FROM public_users WHERE email=? AND guest=0").bind(form.email).first<UserRow>();
  if (!row || !await verifyPassword(form.password, row.password_hash))
    throw new ServiceError(401, "Неверный email или пароль.");
  return { user: asPublicUser(row), token: await createSession(row.id) };
}
export async function createGuestUser() {
  const id = "guest:" + crypto.randomUUID();
  const row: UserRow = { id, email: id.slice(6) + "@guest.profectium.invalid", full_name: "Гость Profectium", password_hash: null, role: "employer", guest: 1 };
  await database().prepare("INSERT INTO public_users(id,email,full_name,password_hash,role,guest,created_at) VALUES(?,?,?,NULL,?,1,?)")
    .bind(id, row.email, row.full_name, row.role, new Date().toISOString()).run();
  await initialize(id);
  return { user: asPublicUser(row), token: await createSession(id) };
}
