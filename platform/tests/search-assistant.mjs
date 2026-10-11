/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

/** Server adapter + actual route, in-memory SQLite, all outbound calls mocked. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
const root = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild"), context = new AsyncLocalStorage();
globalThis.__searchAssistantContext = context;
const compiled = await build({
  absWorkingDir: root, stdin: { resolveDir: root, contents: "export * as route from './app/api/assistant/search/route';" },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  plugins: [{ name: "isolated-assistant", setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "fixture" }));
    b.onResolve({ filter: /session-auth$/ }, () => ({ path: "auth", namespace: "fixture" }));
    b.onResolve({ filter: /^@\// }, (x) => ({ path: path.join(root, x.path.slice(2) + ".ts") }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, (x) => ({ loader: "js", contents: x.path === "env"
      ? "export const env = new Proxy({}, { get(_, key) { return globalThis.__searchAssistantContext.getStore().fixture.env[key]; } });"
      : "export async function getCurrentUser() { return globalThis.__searchAssistantContext.getStore().user; }" }));
  } }],
});
const api = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const origin = "https://profectium.example.com", requestText = "Backend Middle Python до 250 тыс";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(path.join(root, "drizzle")).filter(x => x.endsWith(".sql")).sort()) sqlite.exec(fs.readFileSync(path.join(root, "drizzle", file), "utf8"));
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
    async run() { const result = sqlite.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(result.changes) } }; }
  }
  const f = { sqlite, calls: [], env: { DB: { prepare: (sql) => new Statement(sql) } } };
  for (const [id, role] of [["ea", "employer"], ["eb", "employer"], ["ca", "candidate"]]) sqlite.prepare("INSERT INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) VALUES(?,?,?,?,?,?,0)").run("live:" + id, role, "", id + "@example.com", id, new Date().toISOString());
  f.req = (method = "POST", body = { query: requestText, consent: true }, opts = {}) => context.run({ fixture: f, user: opts.anonymous ? null : { userId: opts.actor ?? "ea" } }, async () => {
    const r = await api.route[method](new Request(origin + "/api/assistant/search?mode=" + (opts.mode ?? "live"), { method, headers: { "Content-Type": "application/json", Origin: origin, "X-Session-Revision": "0", ...opts.headers }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) }));
    return { status: r.status, body: await r.json(), headers: r.headers };
  });
  return f;
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const f = context.getStore()?.fixture;
  assert.ok(f, "No unmocked outbound requests allowed");
  f.calls.push({ url: String(url), options });
  throw new Error("Search must never use an external service");
};
const tests = [];
const test = (name, run) => tests.push({ name, run });
const status = (r, code) => assert.equal(r.status, code, JSON.stringify(r.body));

test("status reports built-in rules without external calls", async f => {
 const r = await f.req("GET"); status(r,200); assert.equal(r.body.configured,true); assert.equal(r.body.engine,"Правила Profectium"); assert.equal(r.headers.get("cache-control"),"no-store"); assert.equal(f.calls.length,0);
});
test("actual POST returns rules draft without sending data or mutating candidates", async f => {
 const r = await f.req(); status(r,200); assert.equal(r.body.intent.filters.role,"Backend"); assert.equal(r.body.intent.filters.maxSalary,"250000"); assert.equal(r.body.intent.canApply,true); assert.equal(f.calls.length,0);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM offers").get().n,0); assert.ok(!JSON.stringify(f.sqlite.prepare("SELECT * FROM audit_events").all()).includes(requestText));
});
test("session, employer role and valid mode required", async f => {
 status(await f.req("GET",undefined,{anonymous:true}),401);status(await f.req("GET",undefined,{actor:"ca"}),403);status(await f.req("POST",undefined,{actor:"ca"}),403);status(await f.req("GET",undefined,{mode:"unexpected"}),422);
});
test("Origin and current revision required",async f=>{status(await f.req("POST",undefined,{headers:{Origin:"https://evil.example.com"}}),403);status(await f.req("POST",undefined,{headers:{"X-Session-Revision":"999"}}),409);});
test("strict bounded query input and optional compatibility field",async f=>{
 status(await f.req("POST",{query:requestText}),200);
 for(const body of [{query:requestText,consent:false},{query:requestText,url:"https://evil.example.com"},{query:"x".repeat(501)},{query:""}])status(await f.req("POST",body),422);
 status(await f.req("POST",{query:"x".repeat(5000)}),413);assert.equal(f.calls.length,0);
});
test("alternatives remain blocked for clarification",async f=>{const r=await f.req("POST",{query:"Python или Go"});status(r,200);assert.equal(r.body.intent.canApply,false);assert.ok(r.body.intent.blocking.length);});
test("unknown terms and requested skills survive parsing",async f=>{const r=await f.req("POST",{query:requestText+" Elixir Казань"});status(r,200);assert.match(r.body.intent.filters.query,/Python/);assert.match(r.body.intent.filters.query,/elixir/);assert.match(r.body.intent.filters.query,/казань/);});
test("per-account minute limit isolates users",async f=>{for(let i=0;i<10;i++)status(await f.req(),200);status(await f.req(),429);status(await f.req("POST",undefined,{actor:"eb"}),200);assert.equal(f.calls.length,0);});
test("daily request limit remains enforced",async f=>{const key="search-assistant-day:live:ea:"+Math.floor(Date.now()/86400000);f.sqlite.prepare("INSERT INTO rate_buckets(id,count,expires_at) VALUES(?,100,?)").run(key,new Date(Date.now()+86400000).toISOString());status(await f.req(),429);});
try {
 for(const {name,run} of tests){const f=fixture();try{await run(f);console.log("PASS",name);}finally{f.sqlite.close();}}
 console.log("Search helper: "+tests.length+" regression groups passed; no outbound requests.");
}finally{globalThis.fetch=originalFetch;delete globalThis.__searchAssistantContext;}
