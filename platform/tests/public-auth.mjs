/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Все права сохранены. */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";

const sqlite = new DatabaseSync(":memory:");
for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync("drizzle/" + file, "utf8"));
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() { return { success: true, meta: { changes: Number(sqlite.prepare(this.sql).run(...this.args).changes) } }; }
}
globalThis.__publicAuthEnv = {
  PUBLIC_DEMO_AUTH: "true",
  DB: {
    prepare: (sql) => new Statement(sql),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  },
};
globalThis.__publicAuthHeaders = new Headers();
const compiled = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    export * as auth from './app/api/auth/[...path]/route';
    export * as api from './app/api/v1/[...path]/route';
    export * as account from './app/api/account/route';
    export * as identity from './app/session-auth';
    export { safeAuthReturn, verifyPassword } from './lib/server/public-auth';
  ` }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  plugins: [{ name: "public-auth-test", setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|next\/headers|next\/navigation)$/ }, (args) => ({ path: args.path, namespace: "auth-test" }));
    b.onLoad({ filter: /.*/, namespace: "auth-test" }, (args) => ({ contents:
      args.path === "cloudflare:workers" ? "export const env=globalThis.__publicAuthEnv;"
      : args.path === "next/headers" ? "export const headers=async()=>globalThis.__publicAuthHeaders;"
      : "export function redirect(url){throw new Error('REDIRECT:'+url)}", loader: "js" }));
  } }],
});
const appModule = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const origin = "https://profectium.example";
async function request(group, path, { method = "GET", body, cookie, headers = {} } = {}) {
  const req = new Request(origin + (group === "auth" ? "/api/auth/" : group === "account" ? "/api/account" : "/api/") + path, {
    method, headers: { ...(method === "GET" ? {} : { Origin: origin, "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  globalThis.__publicAuthHeaders = req.headers;
  const segments = group === "api" ? path.replace(/^(live\/)?v1\//, "").split("/") : path.split("/");
  const response = await appModule[group][method](req, { params: Promise.resolve({ path: segments }) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie"), headers: response.headers };
}
const cookieFrom = (response) => response.cookie?.split(";")[0];
const candidateForm = { email: "judge-candidate@unverified.example", fullName: "Тестовый Соискатель", password: "test12345", role: "candidate" };

const reservedSeedEmail = await request("auth", "register", { method: "POST", body: { ...candidateForm, email: "team@orbita.example" } });
assert.equal(reservedSeedEmail.status, 409, "First registration using the shared organization's reserved email returns a conflict");
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM public_users WHERE email='team@orbita.example'").get().n, 0, "Reserved email must not leave a partially registered account");
assert.equal((await request("api", "live/v1/state", { headers: { "x-profectium-user-id": "forged", "x-profectium-user-email": "forged@example.com" } })).status, 401, "Untrusted identity headers must not authenticate public visitors");
const registration = await request("auth", "register", { method: "POST", body: candidateForm });
assert.equal(registration.status, 201, JSON.stringify(registration.data));
assert.equal(registration.data.emailVerificationRequired, false);
assert.match(registration.cookie, /HttpOnly/); assert.match(registration.cookie, /Secure/); assert.match(registration.cookie, /SameSite=Lax/);
const candidateCookie = cookieFrom(registration);
const candidateId = registration.data.user.userId;
const stored = sqlite.prepare("SELECT * FROM public_users WHERE id=?").get(candidateId);
assert.notEqual(stored.password_hash, candidateForm.password);
assert.equal(await appModule.verifyPassword(candidateForm.password, stored.password_hash), true);
assert.equal(await appModule.verifyPassword("wrong-password", stored.password_hash), false);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM email_challenges").get().n, 0, "Registration must not create email challenges");
assert.equal(sqlite.prepare("SELECT verified_at FROM members WHERE owner=?").get("live:" + candidateId).verified_at, "", "Unverified email must not be represented as verified");
const candidateState = await request("api", "live/v1/state", { cookie: candidateCookie });
assert.equal(candidateState.status, 200, JSON.stringify(candidateState.data));
assert.equal(candidateState.data.session.role, "candidate");
assert.equal(candidateState.data.session.mode, "live");
assert.equal(candidateState.data.candidates[0].fullName, candidateForm.fullName);
assert.ok(candidateState.data.jobs.length >= 3, "Shared test jobs remain available");
const account = await request("account", "", { cookie: candidateCookie });
assert.equal(account.data.publicAuth, true); assert.equal(account.data.emailVerificationRequired, false);
assert.equal((await request("auth", "register", { method: "POST", body: { ...candidateForm, email: candidateForm.email.toUpperCase() } })).status, 409);
assert.equal((await request("auth", "register", { method: "POST", body: candidateForm, headers: { Origin: "https://other.example" } })).status, 403);
assert.equal((await request("auth", "login", { method: "POST", body: { email: candidateForm.email, password: "wrong-password" } })).status, 401);
const login = await request("auth", "login", { method: "POST", body: { email: candidateForm.email.toUpperCase(), password: candidateForm.password } });
assert.equal(login.status, 200); assert.notEqual(cookieFrom(login), candidateCookie);
assert.equal((await request("auth", "logout", { method: "POST", cookie: cookieFrom(login) })).status, 200);
assert.equal((await request("auth", "session", { cookie: cookieFrom(login) })).data.user, null);
assert.ok((await request("auth", "session", { cookie: candidateCookie })).data.user, "Other signed-in device remains active");

const employer = await request("auth", "register", { method: "POST", body: { ...candidateForm, email: "judge-employer@unverified.example", fullName: "Тестовая Команда", role: "employer" } });
assert.equal(employer.status, 201, JSON.stringify(employer.data));
const employerCookie = cookieFrom(employer);
const employerState = await request("api", "live/v1/state", { cookie: employerCookie });
assert.equal(employerState.data.session.role, "employer");
assert.ok(employerState.data.candidates.length >= 12, "Shared seeded candidate catalog is visible");
assert.equal(employerState.data.company.name, "Тестовая Команда");
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE owner='live-profectium-v1' AND employer_id='live:public-demo-organization'").get().n, 3);
assert.match(sqlite.prepare("SELECT data FROM companies WHERE owner='live:public-demo-organization'").get().data, /Орбита/);
const createJob = await request("api", "live/v1/jobs", { method: "POST", cookie: employerCookie, headers: { "X-Session-Revision": "0", "Idempotency-Key": crypto.randomUUID() }, body: {
  title: "Тестовая публичная вакансия", company: "Тестовая Команда", role: "Frontend", grade: "Junior", city: "Москва", workFormat: "Удалённо", salaryMin: 80000, salaryMax: 120000, skills: ["JavaScript"], description: "Проверка взаимодействия двух независимых зарегистрированных участников.",
} });
assert.equal(createJob.status, 201, JSON.stringify(createJob.data));
const visibleJobs = await request("api", "live/v1/state", { cookie: candidateCookie });
assert.ok(visibleJobs.data.jobs.some((j) => j.title === "Тестовая публичная вакансия"), "Another independently registered candidate can see employer-created job");
assert.equal((await request("api", "live/v1/jobs", { method: "POST", cookie: candidateCookie, headers: { "X-Session-Revision": "0" }, body: {} })).status, 403);

const guest = await request("auth", "guest", { method: "POST" });
assert.equal(guest.status, 201); assert.equal(guest.data.user.guest, true);
const guestCookie = cookieFrom(guest);
const demo = await request("api", "v1/state", { cookie: guestCookie });
assert.equal(demo.status, 200); assert.equal(demo.data.session.mode, "demo");
assert.equal(demo.data.company.name, "Орбита · демокомпания"); assert.ok(demo.data.candidates.length >= 12);
const secondGuest = await request("auth", "guest", { method: "POST" });
assert.notEqual(secondGuest.data.user.userId, guest.data.user.userId, "Guest changes remain isolated");
const upgradeGuest = await request("auth", "register", { method: "POST", cookie: guestCookie, body: { ...candidateForm, email: "guest-upgrade@example.test" } });
assert.equal(upgradeGuest.status, 201);
assert.equal((await request("auth", "session", { cookie: guestCookie })).data.user, null, "Guest session revoked when registering");
sqlite.prepare("UPDATE public_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_id=?").run(candidateId);
assert.equal((await request("auth", "session", { cookie: candidateCookie })).data.user, null);
assert.equal((await request("auth", "session", { cookie: "profectium_session=invalid" })).data.user, null);
assert.equal(appModule.safeAuthReturn("//evil.example"), "/?mode=live");
assert.equal(appModule.safeAuthReturn("/\\evil.example"), "/?mode=live");
assert.equal(appModule.safeAuthReturn("/signin"), "/?mode=live");
assert.equal(appModule.safeAuthReturn("/?mode=live&view=jobs"), "/?mode=live&view=jobs");
globalThis.__publicAuthEnv.PUBLIC_DEMO_AUTH = "false";
assert.equal((await request("auth", "session")).status, 404, "Legacy deployment does not expose standalone registration");
globalThis.__publicAuthHeaders = new Headers({ "x-profectium-user-id": "trusted-worker-user", "x-profectium-user-email": "worker@example.test" });
assert.equal((await appModule.identity.getCurrentUser()).userId, "trusted-worker-user", "Legacy Worker/offline authentication remains available when public mode is disabled");
console.log("Public auth: registration without email verification; shared live interaction; seeded guests; password/session handling; origin and identity guards passed.");
sqlite.close();
