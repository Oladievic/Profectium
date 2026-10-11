/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";

const sqlite = new DatabaseSync(":memory:");
for (const file of (await readdir("drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sqlite.exec(
    await readFile(new URL("../drizzle/" + file, import.meta.url), "utf8"),
  );
class Statement {
  constructor(sql, args = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.sql, args);
  }
  async first() {
    return sqlite.prepare(this.sql).get(...this.args) ?? null;
  }
  async all() {
    return { results: sqlite.prepare(this.sql).all(...this.args) };
  }
  async run() {
    globalThis.__beforeRun?.(this.sql);
    const r = sqlite.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}
globalThis.__testDb = {
  prepare: (sql) => new Statement(sql),
  batch: async (statements) => {
    sqlite.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      sqlite.exec("COMMIT");
      return out;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};
globalThis.__testUser = { userId: "test-owner-a", email: "a@example.test" };
await mkdir(".runtime", { recursive: true });
const aliases = {
  name: "test-environment",
  setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
      path: "cloudflare",
      namespace: "test",
    }));
    b.onResolve({ filter: /session-auth$/ }, () => ({
      path: "auth",
      namespace: "test",
    }));
    b.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
      contents:
        args.path === "cloudflare"
          ? "export const env={get DB(){return globalThis.__testDb}};"
          : "export async function getCurrentUser(){return globalThis.__testUser}",
      loader: "js",
    }));
    b.onResolve({ filter: /^@\// }, (args) => ({
      path: path.resolve(args.path.slice(2) + ".ts"),
    }));
  },
};
await build({
  entryPoints: ["app/api/v1/[...path]/route.ts"],
  outfile: ".runtime/api-test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [aliases],
  logLevel: "silent",
});
await build({
  entryPoints: ["lib/domain.ts"],
  outfile: ".runtime/domain-test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const api = await import("../.runtime/api-test.mjs?" + Date.now());
const domain = await import("../.runtime/domain-test.mjs?" + Date.now());
let revision = 0,
  checks = 0;
const ok = (label) => {
  checks++;
  console.log("PASS " + label);
};
async function request(
  route,
  { method = "GET", body, headers = {}, expected = 200 } = {},
) {
  const req = new Request("https://test.local/api/v1/" + route, {
    method,
    headers: {
      Origin: "https://test.local",
      "Content-Type": "application/json",
      "X-Session-Revision": String(revision),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await api[method](req, {
    params: Promise.resolve({ path: route.split("/") }),
  });
  const value = await result.json();
  assert.equal(result.status, expected, JSON.stringify(value));
  assert.equal(result.headers.get("cache-control"), "no-store");
  if (value.session) revision = value.session.revision;
  return value;
}
let state = await request("state");
assert.equal(state.candidates.length, 12);
assert.equal(state.jobs.length, 3);
ok("atomic seed creates 12 candidates and 3 jobs");
await Promise.all([request("state"), request("state")]);
assert.equal((await request("state")).candidates.length, 12);
ok("repeated seed does not duplicate data");
const filters = {
  query: "React",
  role: "Frontend",
  grade: "all",
  format: "all",
  maxSalary: "",
  hasAchievements: false,
  discipline: "all",
  jobId: "all",
  sort: "relevance",
};
assert.deepEqual(
  domain
    .filterCandidates(state.candidates, filters, state.jobs)
    .map((c) => c.id),
  ["demo-candidate-001"],
);
assert.equal(
  domain.filterCandidates(
    state.candidates,
    { ...filters, query: "", role: "DevOps" },
    state.jobs,
  ).length,
  2,
);
assert.equal(
  domain.filterCandidates(
    state.candidates,
    { ...filters, query: "", role: "DevOps", hasAchievements: true },
    state.jobs,
  ).length,
  1,
);
ok("AND filters and no-achievement inclusion");
const match = domain.matchCandidate(state.candidates[0], state.jobs[0]);
assert.equal(match.matched.length, 4);
assert.equal(match.salary, true);
assert.equal(
  domain.matchCandidate(
    { ...state.candidates[0], salaryMin: 250000, salaryMax: 300000 },
    state.jobs[0],
  ).salary,
  true,
);
ok("explainable skill matching and inclusive salary overlap");
await request("favorites/demo-candidate-004", { method: "PUT" });
await request("favorites/demo-candidate-004", { method: "PUT" });
assert.equal((await request("state")).favorites.length, 1);
ok("favorite PUT is idempotent");
globalThis.__beforeRun = (sql) => {
  if (sql.includes("INSERT OR IGNORE INTO favorites")) {
    globalThis.__beforeRun = undefined;
    sqlite
      .prepare("UPDATE demo_accounts SET revision=revision+1 WHERE owner=?")
      .run("test-owner-a");
  }
};
await request("favorites/demo-candidate-001", { method: "PUT", expected: 409 });
const afterRace = await request("state");
assert.equal(afterRace.favorites.includes("demo-candidate-001"), false);
ok("favorite mutation reports a concurrent session change");
await request("favorites/demo-candidate-004", {
  method: "DELETE",
  headers: { Origin: "https://evil.test" },
  expected: 403,
});
ok("cross-origin mutation rejected");
await request("session", {
  method: "POST",
  body: { role: "employer", candidateId: "foreign-id" },
  expected: 404,
});
ok("unknown participant rejected");
const jobBody = {
  title: "QA engineer: test role",
  company: "Test Demo",
  role: "QA",
  grade: "Middle",
  city: "Москва",
  workFormat: "Удалённо",
  salaryMin: 150000,
  salaryMax: 220000,
  skills: ["SQL", "TypeScript"],
  description:
    "Синтетическая вакансия для проверки создания и повторных запросов.",
};
const jobKey = crypto.randomUUID();
state = await request("jobs", {
  method: "POST",
  body: jobBody,
  headers: { "Idempotency-Key": jobKey },
  expected: 201,
});
await request("jobs", {
  method: "POST",
  body: jobBody,
  headers: { "Idempotency-Key": jobKey },
  expected: 201,
});
assert.equal(
  (await request("state")).jobs.filter((j) => j.id === jobKey).length,
  1,
);
await request("jobs", {
  method: "POST",
  body: { ...jobBody, title: "Changed payload" },
  headers: { "Idempotency-Key": jobKey },
  expected: 409,
});
ok("job creation idempotency and key/payload conflict");
await request("offers", {
  method: "POST",
  body: {
    candidateId: "demo-candidate-012",
    jobId: jobKey,
    message: "Тестовое предложение без зарплатной вилки.",
  },
  headers: { "Idempotency-Key": crypto.randomUUID() },
  expected: 422,
});
ok("offer salary is mandatory");
const offerBody = {
  candidateId: "demo-candidate-012",
  jobId: jobKey,
  employerContact: "hr@example.test",
  salaryMin: 180000,
  salaryMax: 230000,
  message: "Предлагаем обсудить задачи команды и познакомиться с коллегами.",
};
const offerKey = crypto.randomUUID();
state = await request("offers", {
  method: "POST",
  body: offerBody,
  headers: { "Idempotency-Key": offerKey },
  expected: 201,
});
await request("offers", {
  method: "POST",
  body: offerBody,
  headers: { "Idempotency-Key": offerKey },
});
await request("offers", {
  method: "POST",
  body: offerBody,
  headers: { "Idempotency-Key": crypto.randomUUID() },
  expected: 409,
});
ok("offer creation, retry and duplicate pending prevention");
const employerRevision = revision;
await request("session", {
  method: "POST",
  body: { role: "candidate", candidateId: "demo-candidate-012" },
});
await request("jobs", {
  method: "POST",
  body: jobBody,
  headers: {
    "Idempotency-Key": crypto.randomUUID(),
    "X-Session-Revision": String(employerRevision),
  },
  expected: 409,
});
await request("jobs", {
  method: "POST",
  body: jobBody,
  headers: { "Idempotency-Key": crypto.randomUUID() },
  expected: 403,
});
ok("stale session and candidate/employer authorization");
await request("offers/demo-offer-001", {
  method: "PATCH",
  body: { status: "accepted" },
  expected: 409,
});
ok("candidate cannot answer another profile offer");
state = await request("offers/" + offerKey, {
  method: "PATCH",
  body: { status: "accepted" },
});
assert.equal(state.offers.find((o) => o.id === offerKey).status, "accepted");
await request("offers/" + offerKey, {
  method: "PATCH",
  body: { status: "declined" },
  expected: 409,
});
ok("offer transitions happen only once");
const c = state.candidates.find((c) => c.id === "demo-candidate-012");
const profile = {
  fullName: c.fullName,
  role: c.role,
  grade: c.grade,
  city: c.city,
  workFormat: c.workFormat,
  salaryMin: c.salaryMin,
  salaryMax: c.salaryMax,
  yearsExperience: c.yearsExperience,
  skills: c.skills,
  bio: c.bio,
  available: true,
  contact: c.contact,
  softSkills: c.softSkills,
  fspId: c.fspId,
  privacy: { processing: true, publication: true, showAchievements: true },
};
await request("profile", {
  method: "PATCH",
  body: { ...profile, achievements: [] },
  headers: { "If-Match": String(c.revision) },
  expected: 422,
});
state = await request("profile", {
  method: "PATCH",
  body: { ...profile, bio: profile.bio + " Тест сохранения." },
  headers: { "If-Match": String(c.revision) },
});
await request("profile", {
  method: "PATCH",
  body: profile,
  headers: { "If-Match": String(c.revision) },
  expected: 409,
});
ok("profile allowlist and optimistic concurrency");
const before = state.candidates.find((x) => x.id === c.id);
state = await request("profile/sync", { method: "POST", body: {} });
assert.equal(state.candidates.find((x) => x.id === c.id).grade, before.grade);
assert.equal(
  state.candidates.find((x) => x.id === c.id).achievements[0].source,
  "mock-fsp",
);
ok("FSP sync does not infer commercial grade");

assert.equal(state.candidates.length, 1);
await request("candidates", { expected: 403 });
await request("candidates/demo-candidate-001", { expected: 403 });
await request("fsp/participants/demo-candidate-001", { expected: 403 });
ok("candidate cannot read other profiles through state, catalog, ID or FSP");
state = await request("session", {
  method: "POST",
  body: { role: "employer", candidateId: c.id },
});
assert.ok(state.candidates.find((x) => x.id === c.id).contact);
assert.ok(!state.candidates.find((x) => x.id === "demo-candidate-001").contact);
ok("contacts are disclosed only for accepted invitations");
const directId = crypto.randomUUID();
state = await request("offers", {
  method: "POST",
  headers: { "Idempotency-Key": directId },
  body: {
    candidateId: "demo-candidate-009",
    jobTitle: "Прямое предложение DevOps",
    employerContact: "hr@example.test",
    salaryMin: 290000,
    salaryMax: 340000,
    message:
      "Приглашаем познакомиться с командой инфраструктуры и обсудить условия.",
  },
  expected: 201,
});
assert.equal(state.offers.find((o) => o.id === directId).jobId, "");
assert.ok(!state.offers.find((o) => o.id === directId).candidateContact);
ok("direct invitation works without a published vacancy and hides contacts");
state = await request("onboarding", {
  method: "POST",
  body: {
    fullName: "Тестовый Кандидат",
    contact: "new@example.test",
    processing: true,
    publication: true,
  },
  expected: 201,
});
assert.equal(state.candidates.length, 1);
assert.equal(state.candidates[0].qualification, undefined);
assert.equal(state.candidates[0].achievements.length, 0);
await request("assessments", {
  method: "POST",
  body: {
    role: "Backend",
    grade: "Senior",
    industry: "ИТ-продукты",
    motivation: "Разрабатываю API для тестового продукта",
  },
  expected: 201,
});
state = await request("state");
let active = state.assessments[0];
assert.equal(active.questions.length, 6);
assert.ok(!JSON.stringify(state).includes("correctIndex"));
assert.ok(!JSON.stringify(state).includes("answer_key"));
await request("assessments", {
  method: "POST",
  body: {
    role: "Backend",
    grade: "Senior",
    industry: "ИТ-продукты",
    motivation: "Разрабатываю API для тестового продукта",
  },
  expected: 409,
});
await request("assessments/" + active.id, {
  method: "POST",
  body: { answers: { [crypto.randomUUID()]: crypto.randomUUID() } },
  expected: 422,
});
const getKeys = (id) =>
  JSON.parse(
    sqlite.prepare("SELECT answer_key FROM assessments WHERE id=?").get(id)
      .answer_key,
  );
let keys = getKeys(active.id);
const wrong = Object.fromEntries(
  active.questions.map((q) => [
    q.id,
    q.options.find((o) => o.id !== keys[q.id]).id,
  ]),
);
state = await request("assessments/" + active.id, {
  method: "POST",
  body: { answers: wrong },
});
assert.equal(state.assessments[0].status, "failed");
assert.equal(state.candidates[0].qualification, undefined);
await request("assessments/" + active.id, {
  method: "POST",
  body: { answers: keys },
  expected: 409,
});
ok(
  "server grades tests, rejects malformed answers and cannot overwrite a failed attempt",
);
state = await request("assessments", {
  method: "POST",
  body: {
    role: "Backend",
    grade: "Junior",
    industry: "ИТ-продукты",
    motivation: "Хочу подтвердить базовый уровень разработки API",
  },
  expected: 201,
});
active = state.assessments[0];
keys = getKeys(active.id);
state = await request("assessments/" + active.id, {
  method: "POST",
  body: { answers: keys },
});
assert.equal(state.candidates[0].qualification.grade, "Junior");
assert.equal(state.candidates[0].qualification.role, "Backend");
assert.equal(state.candidates[0].qualification.score, 100);
await request("assessments/" + active.id, {
  method: "POST",
  body: { answers: keys },
});
await request("assessments", {
  method: "POST",
  body: {
    role: "Backend",
    grade: "Middle",
    industry: "ИТ-продукты",
    motivation: "Пробую повысить свой уровень после успешного теста",
  },
  expected: 409,
});
ok(
  "voluntary lower-level retry, category assignment, idempotent submission and 90-day change limit",
);
let nc = state.candidates[0];
const np = {
  fullName: nc.fullName,
  role: "Frontend",
  grade: "Senior",
  city: nc.city,
  workFormat: nc.workFormat,
  salaryMin: nc.salaryMin,
  salaryMax: nc.salaryMax,
  yearsExperience: 0,
  skills: nc.skills,
  bio: nc.bio,
  available: true,
  contact: nc.contact,
  softSkills: [],
  fspId: "",
  privacy: { processing: true, publication: true, showAchievements: true },
};
await request("profile", {
  method: "PATCH",
  headers: { "If-Match": String(nc.revision) },
  body: { ...np, qualification: { grade: "Senior" } },
  expected: 422,
});
state = await request("profile", {
  method: "PATCH",
  headers: { "If-Match": String(nc.revision) },
  body: np,
});
assert.equal(state.candidates[0].qualification.grade, "Junior");
state = await request("session", {
  method: "POST",
  body: { role: "employer", candidateId: nc.id },
});
const found = state.candidates.find((x) => x.id === nc.id);
assert.equal(found.role, "Backend");
assert.equal(found.grade, "Junior");
assert.ok(!found.contact);
ok("self-reported edits cannot forge the employer-visible category");
state = await request("session", {
  method: "POST",
  body: { role: "candidate", candidateId: nc.id },
});
nc = state.candidates[0];
await request("profile", {
  method: "PATCH",
  headers: { "If-Match": String(nc.revision) },
  body: {
    ...np,
    privacy: { processing: true, publication: false, showAchievements: false },
  },
});
state = await request("session", {
  method: "POST",
  body: { role: "employer", candidateId: nc.id },
});
assert.ok(!state.candidates.some((x) => x.id === nc.id));
await request("candidates/" + nc.id, { expected: 404 });
await request("offers", {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: {
    candidateId: nc.id,
    jobTitle: "Тестовое приглашение",
    employerContact: "test@example.test",
    salaryMin: 90000,
    salaryMax: 100000,
    message: "Нельзя отправить приглашение скрытому профилю.",
  },
  expected: 404,
});
ok(
  "withdrawn publication consent hides profile from state, direct lookup and invitations",
);
assert.ok(
  domain.rankingScore({
    ...found,
    achievements: [],
    qualification: { ...found.qualification, score: 90 },
  }) >
    domain.rankingScore({
      ...found,
      achievements: [],
      qualification: { ...found.qualification, score: 70 },
    }),
);
ok("ranking increases with test evidence within a category");
globalThis.__testUser = { userId: "test-owner-b", email: "b@example.test" };
revision = 0;
const other = await request("state");
assert.equal(other.jobs.length, 3);
assert.equal(other.favorites.length, 0);
await request("offers/" + offerKey, {
  method: "PATCH",
  body: { status: "withdrawn" },
  expected: 409,
});
ok("separate owners cannot access each other records");
globalThis.__testUser = null;
await request("state", { expected: 401 });
ok("anonymous access rejected");
console.log("\n" + checks + " checks passed");
sqlite.close();
