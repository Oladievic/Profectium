/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

/** Real v4 routes + migrations in isolated SQLite; no network or persistent test data. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
const root = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild"), context = new AsyncLocalStorage();
globalThis.__employerTestContext = context;
const compiled = await build({
  absWorkingDir: root, stdin: { resolveDir: root, contents: "export * as route from './app/api/v4/[...path]/route'; export { scoreEmployerTest, normalizeAnswers } from './lib/server/employer-test-store'; export { publishableTestSchema } from './lib/server/employer-test-validation'; export { exampleTest } from './app/employer-test-examples';" },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  plugins: [{ name: "isolated-employer-tests", setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "fixture" }));
    b.onResolve({ filter: /session-auth$/ }, () => ({ path: "auth", namespace: "fixture" }));
    b.onResolve({ filter: /^@\// }, (x) => ({ path: path.join(root, x.path.slice(2) + (x.path.endsWith(".json") ? "" : ".ts")) }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, (x) => ({ loader: "js", contents: x.path === "env"
      ? "export const env = new Proxy({}, { get(_, key) { return globalThis.__employerTestContext.getStore().fixture.env[key]; } });"
      : "export async function getCurrentUser() { return globalThis.__employerTestContext.getStore().user; }" }));
  } }],
});
const api = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const ORIGIN = "https://employer-tests.invalid", LIVE = "live-profectium-v1";
const uuid = () => crypto.randomUUID(), now = () => new Date().toISOString();
const due = () => new Date(Date.now() + 3 * 86400000).toISOString();
const expect = (r, s) => assert.equal(r.status, s, JSON.stringify(r.body).slice(0, 400));
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(path.join(root, "drizzle")).filter((x) => x.endsWith(".sql")).sort()) sqlite.exec(fs.readFileSync(path.join(root, "drizzle", file), "utf8"));
  const f = { sqlite, beforeRun: null };
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
    async run() { f.beforeRun?.(this.sql, this.args); const result = sqlite.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(result.changes) } }; }
  }
  f.env = { DB: { prepare: (sql) => new Statement(sql), batch: async (statements) => {
    sqlite.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; } catch (e) { sqlite.exec("ROLLBACK"); throw e; }
  } } };
  f.member = (id, role = "candidate") => {
    const candidateId = role === "candidate" ? uuid() : "";
    sqlite.prepare("INSERT INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) VALUES(?,?,?,?,?,?,0)").run("live:" + id, role, candidateId, id + "@example.invalid", id, now());
    if (role === "employer") sqlite.prepare("INSERT INTO companies(owner,data) VALUES(?,?)").run("live:" + id, JSON.stringify({ name: "Company " + id, industry: "ИТ", description: "Testing company", contact: "private@example.invalid" }));
    else {
      const candidate = { id: candidateId, fullName: "Candidate " + id, initials: "CC", role: "Backend", grade: "Junior", city: "Москва", workFormat: "Удалённо", salaryMin: 80000, salaryMax: 140000, yearsExperience: 1, skills: ["TypeScript"], bio: "Test bio", softSkills: [], contact: "private@example.invalid", achievements: [], available: true,
        qualification: { role: "Backend", grade: "Junior", score: 83, passedAt: now(), nextChangeAt: due(), attemptId: uuid(), synthetic: false },
        privacy: { processing: true, publication: true, showAchievements: true, consentAt: now() } };
      sqlite.prepare("INSERT INTO candidates(owner,id,data,revision) VALUES(?,?,?,0)").run(LIVE, candidateId, JSON.stringify(candidate));
    }
    return candidateId;
  };
  f.read = (kind, id, actor = "ea") => sqlite.prepare("SELECT * FROM career_records WHERE owner=? AND kind=? AND id=?").get(kind === "employer-test" ? "live:" + actor : LIVE, kind, id);
  f.change = (kind, id, mutate) => {
    const r = f.read(kind, id), d = JSON.parse(r.data); mutate(d);
    sqlite.prepare("UPDATE career_records SET data=? WHERE owner=? AND kind=? AND id=?").run(JSON.stringify(d), r.owner, kind, id);
  };
  f.req = (actor, endpoint, method = "GET", body, headers = {}, authenticated = true) => context.run({ fixture: f, user: authenticated ? { userId: actor } : null }, async () => {
    const account = sqlite.prepare("SELECT revision FROM members WHERE owner=?").get("live:" + actor);
    const response = await api.route[method](new Request(ORIGIN + "/api/live/v4/" + endpoint, { method,
      headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Session-Revision": String(account?.revision ?? 0), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
      { params: Promise.resolve({ path: endpoint.split("/") }) });
    return { status: response.status, body: await response.json() };
  });
  f.member("ea", "employer"); f.member("eb", "employer"); f.ca = f.member("ca"); f.cb = f.member("cb");
  return f;
}
const definition = (manual = true) => ({ title: "Проверка API", skill: "TypeScript", description: "Проверка практических решений работодателем", estimatedMinutes: 20, passingPercent: 70, questions: [
  { id: "single", kind: "single", prompt: "Как безопасно проверить доступ?", points: 4, options: [{ id: "s1", label: "На сервере" }, { id: "s2", label: "В интерфейсе" }], correctOptionIds: ["s1"], explanation: "Секретное объяснение API-сервера", rubric: "" },
  { id: "multi", kind: "multiple", prompt: "Выберите необходимые проверки", points: 3, options: [{ id: "m1", label: "Владелец" }, { id: "m2", label: "Ревизия" }, { id: "m3", label: "Цвет кнопки" }], correctOptionIds: ["m1", "m2"], explanation: "Секретное объяснение проверки", rubric: "" },
  ...(manual ? [{ id: "open", kind: "text", prompt: "Объясните обработку повторного запроса", points: 3, options: [], correctOptionIds: [], explanation: "", rubric: "Оценить идемпотентность и обработку конфликта версий." }] : []),
] });
const correct = { single: ["s1"], multi: ["m2", "m1"], open: "Сохраняем ключ идемпотентности и не дублируем результат." };
async function create(f, data = definition()) { const id = uuid(), r = await f.req("ea", "tests", "POST", { id, data }); expect(r, 201); return r.body.test; }
async function publish(f, data = definition()) { const d = await create(f, data), r = await f.req("ea", "tests/" + d.id, "PATCH", { revision: d.revision, action: "publish" }); expect(r, 200); return r.body.test; }
async function invite(f, test = null, candidateId = f.ca) { const t = test ?? await publish(f), r = await f.req("ea", `tests/${t.id}/invitations`, "POST", { id: uuid(), revision: t.revision, candidateId, dueAt: due() }); expect(r, 201); return r.body.attempt; }
async function start(f, attempt = null) { const a = attempt ?? await invite(f), r = await f.req("ca", "attempts/" + a.id, "PATCH", { revision: a.revision, action: "start" }); expect(r, 200); return r.body.attempt; }
async function action(f, a, verb, extra = {}, actor = "ca", want = 200) { const r = await f.req(actor, "attempts/" + a.id, "PATCH", { revision: a.revision, action: verb, ...extra }); expect(r, want); return r.body.attempt; }
const checks = [];
const test = (name, run) => checks.push({ name, run });

test("full create/publish/invite/autosave/reload/submit/manual review workflow, same result for both participants", async (f) => {
  const original = f.sqlite.prepare("SELECT data,revision FROM candidates WHERE id=?").get(f.ca);
  let a = await start(f); a = await action(f, a, "save", { answers: correct });
  const reloaded = (await f.req("ca", "attempts/" + a.id)).body.attempt;
  assert.deepEqual(reloaded.answers, { ...correct, multi: ["m1", "m2"] });
  a = await action(f, a, "submit", { answers: correct });
  assert.equal(a.state, "submitted"); assert.equal(a.result.percent, null); assert.equal(a.result.earnedPoints, 7); assert.equal(a.result.pendingReview, 1);
  a = await action(f, a, "review", { reviews: [{ questionId: "open", points: 2, feedback: "Правильно описан ключ, нужны детали гонки." }], feedback: "Хороший результат, обсудим обработку конкурирующих запросов." }, "ea");
  assert.equal(a.state, "reviewed"); assert.equal(a.result.percent, 90); assert.equal(a.result.passed, true);
  assert.deepEqual((await f.req("ca", "attempts/" + a.id)).body.attempt.result, a.result);
  assert.deepEqual(f.sqlite.prepare("SELECT data,revision FROM candidates WHERE id=?").get(f.ca), original);
});
test("candidate gets no definitions/keys/explanations, employer cannot inspect draft answers", async (f) => {
  let a = await start(f); a = await action(f, a, "save", { answers: correct });
  const candidateState = await f.req("ca", "state"), candidateDetail = await f.req("ca", "attempts/" + a.id);
  assert.deepEqual(candidateState.body.tests, []);
  for (const r of [candidateState, candidateDetail]) { const s = JSON.stringify(r); assert.ok(!s.includes("correctOptionIds")); assert.ok(!s.includes("Секретное объяснение")); }
  const employerDetail = (await f.req("ea", "attempts/" + a.id)).body.attempt;
  assert.deepEqual(employerDetail.answers, {}); assert.equal(employerDetail.savedAnswers, 0); assert.equal(employerDetail.result, null);
});
test("empty draft saves, publication requires valid questions, draft edit revision checked", async (f) => {
  const data = { ...definition(), questions: [] }, t = await create(f, data);
  expect(await f.req("ea", `tests/${t.id}`, "PATCH", { revision: 0, action: "publish" }), 422);
  expect(await f.req("ea", `tests/${t.id}`, "PUT", { revision: 0, data: definition() }), 200);
  expect(await f.req("ea", `tests/${t.id}`, "PUT", { revision: 0, data: definition() }), 409);
});
test("published definition immutable; archive stops invites without changing existing snapshots", async (f) => {
  const t = await publish(f), a = await invite(f, t);
  expect(await f.req("ea", `tests/${t.id}`, "PUT", { revision: t.revision, data: definition() }), 409);
  expect(await f.req("ea", `tests/${t.id}`, "PATCH", { revision: t.revision, action: "archive" }), 200);
  expect(await f.req("ea", `tests/${t.id}/invitations`, "POST", { id: uuid(), revision: t.revision + 1, candidateId: f.cb, dueAt: due() }), 409);
  assert.equal((await start(f, a)).title, t.title);
});
test("roles, authentication and isolation prevent definition/attempt access by strangers", async (f) => {
  const t = await publish(f), a = await invite(f, t);
  expect(await f.req("ca", "tests", "POST", { id: uuid(), data: definition() }), 403);
  expect(await f.req("ca", `tests/${t.id}`), 403);
  expect(await f.req("eb", `tests/${t.id}`), 404);
  for (const actor of ["eb", "cb"]) expect(await f.req(actor, `attempts/${a.id}`), 404);
  expect(await f.req("ea", "state", "GET", undefined, {}, false), 401);
  await action(f, a, "start", {}, "ea", 403);
  await action(f, a, "cancel", {}, "ca", 403);
});
test("Origin and session revision checked before mutation", async (f) => {
  expect(await f.req("ea", "tests", "POST", { id: uuid(), data: definition() }, { Origin: "https://attacker.invalid" }), 403);
  expect(await f.req("ea", "tests", "POST", { id: uuid(), data: definition() }, { "X-Session-Revision": "99" }), 409);
});
test("question and option uniqueness/key membership/type constraints", async (f) => {
  const mutations = [
    d => d.questions.push(structuredClone(d.questions[0])),
    d => d.questions[0].correctOptionIds = ["absent"],
    d => d.questions[0].options.push(structuredClone(d.questions[0].options[0])),
    d => d.questions[0].correctOptionIds = ["s1", "s2"],
    d => d.questions[2].correctOptionIds = ["s1"],
    d => d.questions[0].id = "constructor",
    d => d.questions[0].points = 0,
    d => d.questions[0].points = 1.5,
  ];
  for (const mutate of mutations) { const d = definition(); mutate(d); expect(await f.req("ea", "tests", "POST", { id: uuid(), data: d }), 422); }
});
test("publication rejects incomplete keys/labels/manual criteria even if draft saved", async (f) => {
  for (const mutate of [d => d.questions[0].correctOptionIds = [], d => d.questions[0].options[1].label = "На сервере", d => d.questions[2].rubric = ""]) {
    const d = definition(); mutate(d); const t = await create(f, d);
    expect(await f.req("ea", `tests/${t.id}`, "PATCH", { revision: t.revision, action: "publish" }), 422);
  }
});
test("unknown answers, invalid type/options, duplicate selections and injected score rejected", async (f) => {
  const a = await start(f);
  for (const answers of [{ unknown: [] }, { single: "s1" }, { single: ["m1"] }, { single: ["s1", "s2"] }, { multi: ["m1", "m1"] }, { open: ["s1"] }]) await action(f, a, "save", { answers }, "ca", 422);
  await action(f, a, "submit", { answers: correct, score: 100 }, "ca", 422);
});
test("single and multiple choice scoring exhaustive; exact set required, no partial or client score", async () => {
  const d = definition(false);
  for (let mask = 0; mask < 8; mask++) {
    const answers = { single: ["s1"], multi: ["m1", "m2", "m3"].filter((_, index) => mask & (1 << index)) };
    const result = api.scoreEmployerTest(d, api.normalizeAnswers(d.questions, answers));
    assert.equal(result.earnedPoints, mask === 3 ? 7 : 4); assert.equal(result.final, true);
  }
  const thirds = { ...definition(false), passingPercent: 67, questions: definition(false).questions.slice(0, 1).map(q => ({ ...q, points: 3 })) };
  thirds.questions = [1, 2, 3].map(i => ({ ...thirds.questions[0], id: "q" + i, points: 1 }));
  const result = api.scoreEmployerTest(thirds, api.normalizeAnswers(thirds.questions, { q1: ["s1"], q2: ["s1"] }));
  assert.equal(result.percent, 66.67); assert.equal(result.passed, false);
  const inheritedName = { ...d.questions[0], id: "toString" };
  assert.deepEqual(api.normalizeAnswers([inheritedName], {}), { toString: [] });
});
test("choice-only test final immediately; unanswered questions score zero", async (f) => {
  let a = await start(f, await invite(f, await publish(f, definition(false))));
  a = await action(f, a, "submit", { answers: {} });
  assert.equal(a.state, "reviewed"); assert.equal(a.result.earnedPoints, 0); assert.equal(a.result.percent, 0); assert.equal(a.result.passed, false);
});
test("start and same submit retries idempotent, changed completed answers rejected", async (f) => {
  const initial = await invite(f), started = await start(f, initial), replay = await action(f, initial, "start");
  assert.equal(replay.revision, started.revision);
  const result = await action(f, started, "submit", { answers: correct }), retry = await action(f, started, "submit", { answers: correct });
  assert.equal(retry.revision, result.revision); assert.deepEqual(retry.result, result.result);
  await action(f, result, "submit", { answers: {} }, "ca", 409);
  await action(f, result, "save", { answers: correct }, "ca", 409);
});
test("autosave CAS prevents lost answers from stale tab", async (f) => {
  const a = await start(f); await action(f, a, "save", { answers: { single: ["s1"] } });
  await action(f, a, "save", { answers: { single: ["s2"] } }, "ca", 409);
  assert.deepEqual((await f.req("ca", "attempts/" + a.id)).body.attempt.answers.single, ["s1"]);
});
test("invitation idempotency, duplicate candidate/test and deadline guards", async (f) => {
  const t = await publish(f), body = { id: uuid(), revision: t.revision, candidateId: f.ca, dueAt: due() };
  expect(await f.req("ea", `tests/${t.id}/invitations`, "POST", body), 201);
  expect(await f.req("ea", `tests/${t.id}/invitations`, "POST", body), 200);
  expect(await f.req("ea", `tests/${t.id}/invitations`, "POST", { ...body, id: uuid() }), 409);
  expect(await f.req("ea", `tests/${t.id}/invitations`, "POST", { ...body, id: uuid(), candidateId: f.cb, dueAt: now() }), 422);
});
test("expired active test grades saved answers, ignores new late answers, persists on reload", async (f) => {
  let a = await start(f); a = await action(f, a, "save", { answers: { single: ["s2"], multi: ["m1", "m2"], open: "Сохранённый ответ" } });
  f.change("employer-attempt", a.id, d => d.dueAt = new Date(Date.now() - 1000).toISOString());
  const expired = await action(f, a, "submit", { answers: correct });
  assert.equal(expired.expired, true); assert.equal(expired.result.earnedPoints, 3); assert.equal(expired.answers.open, "Сохранённый ответ");
  assert.deepEqual((await f.req("ca", "attempts/" + a.id)).body.attempt.result, expired.result);
});
for (const verb of ["start", "save", "submit"]) test(`race: ${verb} crosses real database deadline at write, no late answers committed`, async (f) => {
  let a = await invite(f, await publish(f, definition(false)));
  if (verb !== "start") {
    a = await start(f, a);
    a = await action(f, a, "save", { answers: { single: ["s2"], multi: [] } });
  }
  const deadline = Date.now() + 200;
  f.change("employer-attempt", a.id, d => d.dueAt = new Date(deadline).toISOString());
  let crossedAtWrite = false;
  f.beforeRun = (sql) => {
    if (!sql.startsWith("UPDATE career_records")) return;
    f.beforeRun = null;
    crossedAtWrite = true;
    // Cross the real SQLite/D1 clock boundary after validation, not merely a JS mock.
    const wait = Math.max(0, deadline + 35 - Date.now());
    if (wait) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
  };
  const extra = verb === "start" ? {} : { answers: { single: ["s1"], multi: ["m1", "m2"] } };
  const r = await f.req("ca", "attempts/" + a.id, "PATCH", { revision: a.revision, action: verb, ...extra });
  assert.equal(crossedAtWrite, true);
  expect(r, verb === "submit" ? 200 : 409);
  const stored = JSON.parse(f.read("employer-attempt", a.id).data);
  if (verb === "start") {
    assert.equal(stored.state, "invited"); assert.equal(stored.startedAt, null); assert.deepEqual(stored.answers, {});
  } else {
    assert.equal(stored.state, "reviewed"); assert.equal(stored.expired, true);
    assert.deepEqual(stored.answers, { single: ["s2"], multi: [] });
    assert.equal(stored.result.earnedPoints, 0);
    assert.equal((await f.req("ca", "attempts/" + a.id)).body.attempt.result.earnedPoints, 0);
  }
});
test("expired unstarted invitation cannot be started; active expiry finalized by list read", async (f) => {
  const invited = await invite(f); f.change("employer-attempt", invited.id, d => d.dueAt = "2020-01-01T00:00:00.000Z");
  await action(f, invited, "start", {}, "ca", 409);
  const active = await start(f, await invite(f)); f.change("employer-attempt", active.id, d => d.dueAt = "2020-01-01T00:00:00.000Z");
  const state = await f.req("ea", "state"); expect(state, 200); assert.equal(state.body.attempts.find(a => a.id === active.id).state, "submitted");
});
test("manual review rejects omissions/duplicates/overweight/unknown/negative, final immutable", async (f) => {
  const a = await action(f, await start(f), "submit", { answers: correct });
  for (const reviews of [[], [{ questionId: "open", points: 4, feedback: "Оценка" }], [{ questionId: "single", points: 1, feedback: "Оценка" }], [{ questionId: "open", points: -1, feedback: "Оценка" }], [{ questionId: "open", points: 1, feedback: "Оценка" }, { questionId: "open", points: 1, feedback: "Оценка" }]])
    await action(f, a, "review", { reviews, feedback: "Проверка решения кандидата" }, "ea", 422);
  const reviewed = await action(f, a, "review", { reviews: [{ questionId: "open", points: 0, feedback: "Нет нужного объяснения" }], feedback: "Нужно уточнить обработку конфликтов" }, "ea");
  await action(f, reviewed, "review", { reviews: [{ questionId: "open", points: 3, feedback: "Исправлено" }], feedback: "Повторная оценка результата" }, "ea", 409);
});
test("decline/cancel terminates attempt and no employer draft disclosure", async (f) => {
  const a = await start(f); const declined = await action(f, a, "decline"); assert.equal(declined.state, "declined");
  await action(f, declined, "submit", { answers: correct }, "ca", 409);
  const other = await invite(f); const cancelled = await action(f, other, "cancel", {}, "ea"); assert.equal(cancelled.state, "cancelled");
  await action(f, cancelled, "start", {}, "ca", 409);
});
test("processing withdrawal prevents read/save/review and excludes state", async (f) => {
  const a = await start(f);
  f.sqlite.prepare("UPDATE candidates SET data=json_set(data,'$.privacy.processing',0),revision=revision+1 WHERE id=?").run(f.ca);
  expect(await f.req("ca", "attempts/" + a.id), 404); await action(f, a, "save", { answers: correct }, "ca", 404);
  assert.equal((await f.req("ea", "state")).body.attempts.length, 0);
});
test("race: role changed before write causes no test creation", async (f) => {
  f.beforeRun = (sql) => { if (!sql.startsWith("INSERT OR IGNORE INTO career_records")) return; f.beforeRun = null; f.sqlite.prepare("UPDATE members SET revision=revision+1,role='candidate' WHERE owner='live:ea'").run(); };
  expect(await f.req("ea", "tests", "POST", { id: uuid(), data: definition() }), 409);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM career_records WHERE kind='employer-test'").get().n, 0);
});
test("race: candidate privacy changed before invitation creates no record", async (f) => {
  const t = await publish(f);
  f.beforeRun = (sql) => { if (!sql.startsWith("INSERT OR IGNORE INTO career_records")) return; f.beforeRun = null; f.sqlite.prepare("UPDATE candidates SET revision=revision+1,data=json_set(data,'$.privacy.processing',0) WHERE id=?").run(f.ca); };
  expect(await f.req("ea", `tests/${t.id}/invitations`, "POST", { id: uuid(), candidateId: f.ca, revision: t.revision, dueAt: due() }), 409);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM career_records WHERE kind='employer-attempt'").get().n, 0);
});
test("race: archive before invitation prevents stale snapshot use", async (f) => {
  const t = await publish(f);
  f.beforeRun = (sql) => { if (!sql.startsWith("INSERT OR IGNORE INTO career_records")) return; f.beforeRun = null; f.sqlite.prepare("UPDATE career_records SET revision=revision+1,data=json_set(data,'$.state','archived') WHERE kind='employer-test' AND id=?").run(t.id); };
  expect(await f.req("ea", `tests/${t.id}/invitations`, "POST", { id: uuid(), candidateId: f.ca, revision: t.revision, dueAt: due() }), 409);
});
test("race: candidate withdrawal during autosave preserves prior answers", async (f) => {
  const a = await start(f);
  f.beforeRun = (sql) => { if (!sql.startsWith("UPDATE career_records")) return; f.beforeRun = null; f.sqlite.prepare("UPDATE candidates SET revision=revision+1,data=json_set(data,'$.privacy.processing',0) WHERE id=?").run(f.ca); };
  await action(f, a, "save", { answers: correct }, "ca", 409);
  assert.deepEqual(JSON.parse(f.read("employer-attempt", a.id).data).answers, { single: [], multi: [], open: "" });
});
test("strict payloads reject credentials/keys via attempts and oversized JSON", async (f) => {
  const a = await start(f);
  await action(f, a, "save", { answers: {}, correctOptionIds: ["s1"] }, "ca", 422);
  const r = await f.req("ea", "tests", "POST", { id: uuid(), data: { ...definition(), description: "x".repeat(300000) } }); expect(r, 413);
  expect(await f.req("ea", "tests", "POST", { id: uuid(), data: definition() }, { "Content-Length": "262145" }), 413);
});
test("bounded large definitions and long saved answers over32KiB accepted without truncation", async (f) => {
  const d = definition();
  d.questions = Array.from({ length: 20 }, (_, i) => ({ ...definition().questions[2], id: "text" + i, prompt: "Проверка архитектуры: " + "я".repeat(1700) }));
  assert.ok(Buffer.byteLength(JSON.stringify(d)) > 32768);
  const a = await start(f, await invite(f, await publish(f, d)));
  const answers = Object.fromEntries(d.questions.map(q => [q.id, "ы".repeat(5000)]));
  assert.ok(Buffer.byteLength(JSON.stringify(answers)) > 32768);
  const saved = await action(f, a, "save", { answers });
  assert.deepEqual(saved.answers, answers);
  assert.deepEqual((await f.req("ca", "attempts/" + a.id)).body.attempt.answers, answers);
});
test("unknown URL shapes never resolve to neighboring actions", async (f) => {
  const t = await publish(f), a = await invite(f, t);
  for (const endpoint of ["unknown", "state/extra", `tests/${t.id}/extra`, `attempts/${a.id}/extra`, "tests/x/y/z"])
    expect(await f.req("ea", endpoint), 404);
  for (const endpoint of ["state", `tests/${t.id}/invitation`, "test"])
    expect(await f.req("ea", endpoint, "POST", {}), 404);
});
test("invitation preserves employer name snapshot, never private contact", async (f) => {
  const a = await invite(f);
  f.sqlite.prepare("UPDATE companies SET data=json_set(data,'$.name','Renamed Company') WHERE owner='live:ea'").run();
  const detail = (await f.req("ca", "attempts/" + a.id)).body.attempt;
  assert.equal(detail.employerName, "Company ea");
  assert.ok(!JSON.stringify(detail).includes("private@example.invalid"));
});
test("all UI examples publish, semantic answers score correctly, no one-based option offset", async (f) => {
  const expectations = {
    Backend: {
      single: "Хранить результат по уникальному ключу идемпотентности и проверять совпадение запроса",
      multiple: ["p95/p99 времени ответа", "Длительность запросов к базе и ожидание пула соединений", "Частота ошибок и распределённые трассировки"],
    },
    Frontend: {
      single: "Проверять актуальность идентификатора запроса перед обновлением состояния",
      multiple: ["Связанные с полями подписи", "Работа с клавиатурой и видимый фокус", "Текст ошибки и связь с соответствующим полем"],
    },
    QA: {
      single: "99, 100, 101, 9999, 10000, 10001",
      multiple: ["Отсутствие двойного списания", "Согласованность статуса заказа после сетевого сбоя", "Доступ только владельцу заказа"],
    },
  };
  for (const [direction, expected] of Object.entries(expectations)) {
    const d = api.exampleTest(direction);
    assert.equal(api.publishableTestSchema.safeParse(d).success, true, direction + " example must publish");
    const single = d.questions.find(q => q.kind === "single"), multiple = d.questions.find(q => q.kind === "multiple"), open = d.questions.find(q => q.kind === "text");
    const optionByLabel = (q, label) => { const option = q.options.find(o => o.label === label); assert.ok(option, direction + " lacks expected semantic option " + label); return option.id; };
    assert.deepEqual(single.correctOptionIds.map(id => single.options.find(o => o.id === id)?.label), [expected.single]);
    assert.deepEqual(multiple.correctOptionIds.map(id => multiple.options.find(o => o.id === id)?.label), expected.multiple);
    assert.deepEqual(multiple.correctOptionIds, ["o1", "o2", "o4"]);
    const answers = { [single.id]: [optionByLabel(single, expected.single)], [multiple.id]: expected.multiple.map(label => optionByLabel(multiple, label)), [open.id]: "Развёрнутый ответ с аргументацией и проверкой результата." };
    const a = await start(f, await invite(f, await publish(f, d)));
    const submitted = await action(f, a, "submit", { answers });
    assert.equal(submitted.result.earnedPoints, 10, direction + " automatic score");
    assert.equal(submitted.result.pendingReview, 1);
    const reviewed = await action(f, submitted, "review", { reviews: [{ questionId: open.id, points: 10, feedback: "Каждый пункт опубликованной рубрики выполнен." }], feedback: "Все задачи решены с обоснованием и проверкой результата." }, "ea");
    assert.equal(reviewed.result.percent, 100); assert.equal(reviewed.result.passed, true);
    const wrongAnswers = { [single.id]: [single.options.find(o => o.label !== expected.single).id], [multiple.id]: [multiple.options.find(o => !expected.multiple.includes(o.label)).id] };
    const wrong = api.scoreEmployerTest(d, api.normalizeAnswers(d.questions, wrongAnswers));
    assert.equal(wrong.earnedPoints, 0, direction + " distractors must not receive automatic points");
  }
});

const priorFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network forbidden in employer tests"); };
const results = [];
try {
  for (const check of checks) {
    const f = fixture();
    try { await check.run(f); results.push({ name: check.name, passed: true }); console.log("PASS", check.name); }
    finally { f.sqlite.close(); }
  }
} finally { globalThis.fetch = priorFetch; }
if (process.env.PROFECTIUM_TEST_REPORT) fs.writeFileSync(process.env.PROFECTIUM_TEST_REPORT, JSON.stringify({ suite: "employer-tests", groups: results.length, passed: true, at: now(), results }, null, 2));
console.log(`Employer tests: ${results.length} groups passed (real handlers, SQLite, isolated accounts, no network).`);
