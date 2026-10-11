/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";

const compiled = await build({
  entryPoints: ["app/api/v1/[...path]/route.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  plugins: [{ name: "offer-reason-fixture", setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "database", namespace: "test" }));
    b.onResolve({ filter: /session-auth$/ }, () => ({ path: "auth", namespace: "test" }));
    b.onResolve({ filter: /^@\// }, (x) => ({ path: path.resolve(x.path.slice(2) + (x.path.endsWith(".json") ? "" : ".ts")) }));
    b.onLoad({ filter: /.*/, namespace: "test" }, (x) => ({ loader: "js", contents: x.path === "database"
      ? "export const env={get DB(){return globalThis.__offerReasonDb}}"
      : "export async function getCurrentUser(){return globalThis.__offerReasonUser}" }));
  } }],
});
const api = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const migrations = await Promise.all((await readdir("drizzle")).filter((file) => file.endsWith(".sql")).sort().map((file) => readFile(path.join("drizzle", file), "utf8")));
let passed = 0;

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration);
  let beforeRun;
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
    async run() {
      if (beforeRun && this.sql.startsWith("UPDATE offers")) { const hook = beforeRun; beforeRun = null; hook(); }
      return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.args).changes) } };
    }
  }
  globalThis.__offerReasonDb = {
    prepare: (sql) => new Statement(sql),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try { const values = []; for (const statement of statements) values.push(await statement.run()); sqlite.exec("COMMIT"); return values; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  globalThis.__offerReasonUser = { userId: "offer-review", email: "offer-review@example.invalid" };
  let revision = 0;
  async function request(route, body, method = body === undefined ? "GET" : "POST", headers = {}, live = false) {
    const response = await api[method](new Request("https://review.invalid/api/" + (live ? "live/" : "") + "v1/" + route, {
      method, headers: { Origin: "https://review.invalid", "Content-Type": "application/json", "X-Session-Revision": String(revision), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { params: Promise.resolve({ path: route.split("/") }) });
    const value = await response.json();
    if (value.session) revision = value.session.revision;
    return { status: response.status, value };
  }
  const seeded = (await request("state")).value;
  const offer = seeded.offers[0];
  const role = (next, candidateId = offer.candidateId) => request("session", { role: next, candidateId });
  const row = () => sqlite.prepare("SELECT data,status,updated_at FROM offers WHERE owner='offer-review' AND id=?").get(offer.id);
  return { sqlite, request, role, row, offer, seeded, race: (hook) => { beforeRun = hook; } };
}

async function test(name, run) {
  const f = await fixture();
  try { await run(f); passed++; console.log("PASS offer decline: " + name); }
  finally { f.sqlite.close(); }
}

await test("trimmed reason is stored with status, preserves all offer data, and reaches both participants", async (f) => {
  const original = JSON.parse(f.row().data);
  await f.role("candidate");
  const response = await f.request("offers/" + f.offer.id, { status: "declined", declineReason: "  Не подходит формат работы.\nСпасибо за предложение.  " }, "PATCH");
  assert.equal(response.status, 200, JSON.stringify(response.value));
  assert.equal(response.value.offers[0].declineReason, "Не подходит формат работы.\nСпасибо за предложение.");
  assert.equal(f.row().status, "declined");
  assert.deepEqual(JSON.parse(f.row().data), { ...original, declineReason: "Не подходит формат работы.\nСпасибо за предложение." });
  const employer = await f.role("employer");
  assert.equal(employer.value.offers[0].declineReason, response.value.offers[0].declineReason);
});

await test("legacy decline without a reason remains supported", async (f) => {
  const original = f.row().data;
  await f.role("candidate");
  assert.equal((await f.request("offers/" + f.offer.id, { status: "declined" }, "PATCH")).status, 200);
  assert.equal(f.row().data, original);
});

for (const reason of ["", "  \n  ", "x".repeat(501), null, 42]) await test("invalid reason " + JSON.stringify(reason).slice(0, 35) + " is rejected without changes", async (f) => {
  await f.role("candidate");
  const original = { ...f.row() };
  assert.equal((await f.request("offers/" + f.offer.id, { status: "declined", declineReason: reason }, "PATCH")).status, 422);
  assert.deepEqual({ ...f.row() }, original);
});

await test("500 characters are accepted after trimming", async (f) => {
  await f.role("candidate");
  assert.equal((await f.request("offers/" + f.offer.id, { status: "declined", declineReason: " " + "я".repeat(500) + " " }, "PATCH")).status, 200);
  assert.equal(JSON.parse(f.row().data).declineReason.length, 500);
});

for (const status of ["accepted", "withdrawn"]) await test("a reason is rejected for " + status, async (f) => {
  await f.role(status === "withdrawn" ? "employer" : "candidate");
  const original = { ...f.row() };
  assert.equal((await f.request("offers/" + f.offer.id, { status, declineReason: "Текст причины" }, "PATCH")).status, 422);
  assert.deepEqual({ ...f.row() }, original);
});

await test("other candidate and employer cannot decline the invitation", async (f) => {
  const payload = { status: "declined", declineReason: "Чужое предложение" };
  assert.equal((await f.request("offers/" + f.offer.id, payload, "PATCH")).status, 403);
  await f.role("candidate", f.seeded.candidates.find((candidate) => candidate.id !== f.offer.candidateId).id);
  assert.equal((await f.request("offers/" + f.offer.id, payload, "PATCH")).status, 409);
  assert.equal(f.row().status, "pending");
  assert.equal(JSON.parse(f.row().data).declineReason, undefined);
});

await test("a role switch racing the update cannot store a reason or change status", async (f) => {
  await f.role("candidate");
  const original = { ...f.row() };
  f.race(() => f.sqlite.prepare("UPDATE demo_accounts SET role='employer',revision=revision+1 WHERE owner='offer-review'").run());
  assert.equal((await f.request("offers/" + f.offer.id, { status: "declined", declineReason: "Старая вкладка" }, "PATCH")).status, 409);
  assert.deepEqual({ ...f.row() }, original);
});

await test("final refusal cannot be overwritten by a second response", async (f) => {
  await f.role("candidate");
  assert.equal((await f.request("offers/" + f.offer.id, { status: "declined", declineReason: "Исходная причина" }, "PATCH")).status, 200);
  const frozen = { ...f.row() };
  assert.equal((await f.request("offers/" + f.offer.id, { status: "declined", declineReason: "Поздняя замена" }, "PATCH")).status, 409);
  assert.deepEqual({ ...f.row() }, frozen);
});

await test("live candidates can decline only their own invitation and their employer sees the reason", async (f) => {
  const liveOwner = "live-profectium-v1";
  const at = new Date().toISOString();
  for (const [id, role, candidateId] of [["live-candidate", "candidate", f.offer.candidateId], ["live-employer", "employer", ""]])
    f.sqlite.prepare("INSERT INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) VALUES(?,?,?,?,?,?,0)")
      .run("live:" + id, role, candidateId, id + "@example.invalid", id, at);
  const candidate = f.sqlite.prepare("SELECT data FROM candidates WHERE owner='offer-review' AND id=?").get(f.offer.candidateId);
  f.sqlite.prepare("INSERT INTO candidates(owner,id,data,revision) VALUES(?,?,?,0)").run(liveOwner, f.offer.candidateId, candidate.data);
  f.sqlite.prepare("INSERT INTO offers(owner,id,employer_id,candidate_id,job_id,data,status,digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(liveOwner, f.offer.id, "live:live-employer", f.offer.candidateId, "", f.row().data, "pending", "test", at, at);
  globalThis.__offerReasonUser = { userId: "live-candidate", email: "live-candidate@example.invalid" };
  const response = await f.request("offers/" + f.offer.id, { status: "declined", declineReason: "Не подходит зарплата" }, "PATCH", {}, true);
  assert.equal(response.status, 200, JSON.stringify(response.value));
  assert.equal(response.value.offers[0].declineReason, "Не подходит зарплата");
  globalThis.__offerReasonUser = { userId: "live-employer", email: "live-employer@example.invalid" };
  const employer = await f.request("state", undefined, "GET", {}, true);
  assert.equal(employer.status, 200);
  assert.equal(employer.value.offers[0].declineReason, "Не подходит зарплата");
  assert.equal(f.row().status, "pending", "live operations must leave the demonstration workspace unchanged");
});

console.log(`PASS ${passed} offer-decline regression groups: real routes, SQLite in memory, no persisted user data or network`);
