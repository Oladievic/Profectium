/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

/**
 * Independent v3 integration checks. Usage:
 *   node tests/v3-security.mjs
 * Reads real sources and all migrations. Compiles in memory; SQLite is :memory:.
 * All outbound fetches are intercepted. No mail, external service calls or checkout writes.
 * OTPs and synthetic keys remain in memory and are never printed.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";

const project = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(project, "package.json"));
const { build } = require("esbuild");
const execution = new AsyncLocalStorage();
globalThis.__v3ReviewContext = execution;
const bundle = await build({
  absWorkingDir: project,
  stdin: {
    resolveDir: project,
    sourcefile: "v3-review-entry.ts",
    contents: `
    export * as product from './app/api/v1/[...path]/route';
    export * as account from './app/api/account/route';
    export * as integrations from './app/api/integrations/route';
    export * as connect from './app/api/connect/v1/[...path]/route';
    export * as apiAccess from './lib/server/api-access';
    export * as fsp from './lib/server/fsp-http';
    export * as security from './lib/server/security';
  `,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
  plugins: [
    {
      name: "v3-read-only-harness",
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "env",
          namespace: "review",
        }));
        b.onResolve({ filter: /session-auth$/ }, () => ({
          path: "auth",
          namespace: "review",
        }));
        b.onResolve({ filter: /^@\// }, (x) => ({
          path: path.join(project, x.path.slice(2) + ".ts"),
        }));
        b.onLoad({ filter: /.*/, namespace: "review" }, (x) => ({
          loader: "js",
          contents:
            x.path === "env"
              ? `export const env=new Proxy({}, {get(_,key){return globalThis.__v3ReviewContext.getStore().fixture.env[key]}});`
              : `export async function getCurrentUser(){return globalThis.__v3ReviewContext.getStore()?.user ?? null;}`,
        }));
      },
    },
  ],
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const ctx = execution.getStore();
  if (!ctx) throw new Error("Outbound network disabled outside test context");
  return ctx.fixture.fetch(input, init);
};
const LIVE = "live-profectium-v1";
const ORIGIN = "https://review.invalid";
const owner = (id) => "live:" + id;
const NOW = () => new Date().toISOString();
const future = () => new Date(Date.now() + 86400000).toISOString();
const statuses = (result, expected) =>
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(result.status),
    `HTTP ${result.status}; expected ${String(expected)}`,
  );
const noField = (object, name) =>
  assert.ok(!Object.hasOwn(object, name), `Forbidden response field: ${name}`);
const count = (f, table) =>
  Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of fs
    .readdirSync(path.join(project, "drizzle"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(fs.readFileSync(path.join(project, "drizzle", name), "utf8"));
  const f = {
    sqlite,
    mail: [],
    mailFailure: false,
    network: [],
    beforeRun: null,
    fspResponder: null,
  };
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
    execute() {
      f.beforeRun?.(this.sql, this.args);
      const r = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
    async run() {
      return this.execute();
    }
  }
  f.env = {
    DB: {
      prepare: (sql) => new Statement(sql),
      batch: async (statements) => {
        // D1 batches are serial transactions: do not yield between their statements.
        sqlite.exec("BEGIN");
        try {
          const rows = statements.map((s) => s.execute());
          sqlite.exec("COMMIT");
          return rows;
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      },
    },
    RESEND_API_KEY: "unit-test-provider-credential",
    EMAIL_FROM: "test@example.invalid",
    OTP_SECRET: "test-only-otp-pepper-with-more-than-32-characters",
  };
  f.run = (id, fn) =>
    execution.run(
      {
        fixture: f,
        user:
          id === null
            ? null
            : {
                userId: id,
                email: id + "@example.invalid",
                fullName: "Test " + id,
              },
      },
      fn,
    );
  f.fetch = async (input, init) => {
    const u = new URL(
      typeof input === "string" ? input : (input.url ?? input.toString()),
    );
    f.network.push({
      host: u.hostname,
      path: u.pathname,
      redirect: init.redirect,
    });
    if (u.origin === "https://api.resend.com" && u.pathname === "/emails") {
      const body = JSON.parse(init.body);
      const code = /\b\d{6,8}\b/.exec(body.text)?.[0];
      assert.ok(code, "Mail stub did not find the one-time code");
      f.mail.push({ email: body.to[0], code });
      return Response.json(
        f.mailFailure
          ? { message: "stub failure" }
          : { id: crypto.randomUUID() },
        { status: f.mailFailure ? 503 : 200 },
      );
    }
    if (f.fspResponder) return f.fspResponder(u, init);
    throw new Error("Unexpected outbound request blocked by harness");
  };
  f.request = async (
    id,
    urlPath,
    { method = "GET", body, headers = {}, rawRequest } = {},
  ) =>
    f.run(id, async () => {
      const live = !urlPath.startsWith("/api/v1/");
      const account =
        id === null
          ? null
          : sqlite
              .prepare(
                `SELECT revision FROM ${live ? "members" : "demo_accounts"} WHERE owner=?`,
              )
              .get(live ? owner(id) : id);
      const req =
        rawRequest ??
        new Request(ORIGIN + urlPath, {
          method,
          headers: {
            Origin: ORIGIN,
            "Content-Type": "application/json",
            "X-Session-Revision": String(account?.revision ?? 0),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      let handlerModule = api.product,
        parts = [];
      if (urlPath.startsWith("/api/account")) handlerModule = api.account;
      else if (urlPath.startsWith("/api/integrations"))
        handlerModule = api.integrations;
      else if (urlPath.startsWith("/api/connect/")) {
        handlerModule = api.connect;
        parts = new URL(req.url).pathname
          .replace("/api/connect/v1/", "")
          .split("/");
      } else
        parts = new URL(req.url).pathname
          .replace(/^\/api\/(?:live\/)?v1\//, "")
          .split("/");
      assert.equal(
        typeof handlerModule[req.method],
        "function",
        "Requested handler is not exported",
      );
      const response = await handlerModule[req.method](req, {
        params: Promise.resolve({ path: parts }),
      });
      const value = await response.json();
      assert.equal(
        response.headers.get("cache-control"),
        "no-store",
        "Personal API must disable shared caching",
      );
      return { status: response.status, value };
    });
  f.challenge = async (
    id,
    role = "candidate",
    email = id + "@example.invalid",
  ) => {
    const r = await f.request(id, "/api/account", {
      method: "POST",
      body: {
        action: "request",
        role,
        email,
        fullName: "Test " + id,
        processing: true,
      },
    });
    statuses(r, 201);
    const mail = f.mail.findLast((x) => x.email === email.toLowerCase());
    assert.ok(mail, "Expected an intercepted verification email");
    noField(r.value, "code");
    noField(r.value, "code_hash");
    return { challengeId: r.value.challengeId, code: mail.code };
  };
  f.verify = (id, challenge) =>
    f.request(id, "/api/account", {
      method: "POST",
      body: { action: "verify", ...challenge },
    });
  f.enroll = async (id, role) => {
    const c = await f.challenge(id, role);
    const r = await f.verify(id, c);
    statuses(r, 200);
    return r.value.member;
  };
  f.member = (id) =>
    sqlite.prepare("SELECT * FROM members WHERE owner=?").get(owner(id));
  f.candidate = (id) => {
    const m = f.member(id);
    return JSON.parse(
      sqlite
        .prepare("SELECT data FROM candidates WHERE owner=? AND id=?")
        .get(LIVE, m.candidate_id).data,
    );
  };
  f.publish = (id) => {
    const c = f.candidate(id);
    c.available = true;
    c.privacy = {
      ...c.privacy,
      processing: true,
      publication: true,
      showAchievements: true,
    };
    c.qualification = {
      role: "Frontend",
      grade: "Junior",
      score: 100,
      passedAt: NOW(),
      nextChangeAt: future(),
      attemptId: crypto.randomUUID(),
      synthetic: false,
    };
    // Only fixture setup; qualification assignment itself is covered by existing assessment tests.
    sqlite
      .prepare("UPDATE candidates SET data=? WHERE owner=? AND id=?")
      .run(JSON.stringify(c), LIVE, c.id);
    return c;
  };
  f.key = async (
    id,
    scopes = ["candidates:read", "jobs:read", "offers:read"],
  ) => {
    const r = await f.request(id, "/api/integrations?mode=live", {
      method: "POST",
      body: {
        action: "create",
        name: "Review integration",
        scopes,
        expiresInDays: 5,
      },
    });
    statuses(r, 201);
    assert.ok(/^pf_[a-f0-9]{64}$/.test(r.value.token), "Unexpected key format");
    return r.value;
  };
  f.connected = (id, key, resource = "candidates", query = "") =>
    f.request(id, "/api/connect/v1/" + resource + query, {
      headers: { Authorization: "Bearer " + key.token },
    });
  return f;
}
const jobInput = {
  title: "Frontend developer",
  company: "Untrusted form company",
  role: "Frontend",
  grade: "Junior",
  city: "Москва",
  workFormat: "Удалённо",
  salaryMin: 80000,
  salaryMax: 140000,
  skills: ["TypeScript"],
  description: "Поддержка интерфейсов и доступности нашего продукта.",
};
const offerInput = (candidateId, jobId = "") => ({
  candidateId,
  jobId,
  jobTitle: "Frontend project",
  employerContact: "employer@example.invalid",
  salaryMin: 90000,
  salaryMax: 150000,
  message: "Предлагаем обсудить задачи и условия команды.",
});
const profileInput = (c) =>
  Object.fromEntries(
    [
      "fullName",
      "role",
      "grade",
      "city",
      "workFormat",
      "salaryMin",
      "salaryMax",
      "yearsExperience",
      "skills",
      "bio",
      "available",
      "contact",
      "softSkills",
      "fspId",
      "privacy",
    ].map((k) => [
      k,
      k === "privacy"
        ? {
            processing: c.privacy.processing,
            publication: c.privacy.publication,
            showAchievements: c.privacy.showAchievements,
          }
        : c[k],
    ]),
  );
async function pair(f) {
  await f.enroll("employer-a", "employer");
  await f.enroll("employer-b", "employer");
  await f.enroll("candidate-a", "candidate");
  await f.enroll("candidate-b", "candidate");
  return { a: f.publish("candidate-a"), b: f.publish("candidate-b") };
}
async function createJob(f, id, key = crypto.randomUUID()) {
  const r = await f.request(id, "/api/live/v1/jobs", {
    method: "POST",
    body: jobInput,
    headers: { "Idempotency-Key": key },
  });
  statuses(r, 201);
  return key;
}
async function createOffer(
  f,
  id,
  candidateId,
  jobId = "",
  key = crypto.randomUUID(),
) {
  const r = await f.request(id, "/api/live/v1/offers", {
    method: "POST",
    body: offerInput(candidateId, jobId),
    headers: { "Idempotency-Key": key },
  });
  statuses(r, 201);
  return key;
}
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("Live requires session and verified membership; reads never seed a shared sandbox", async (f) => {
  statuses(await f.request(null, "/api/live/v1/state"), 401);
  statuses(await f.request("unverified", "/api/live/v1/state"), 403);
  assert.equal(count(f, "candidates"), 0);
  assert.equal(count(f, "demo_accounts"), 0);
  const account = await f.request("unverified", "/api/account");
  statuses(account, 200);
  assert.equal(account.value.member, null);
});
test("Email provider absent fails closed", async (f) => {
  delete f.env.RESEND_API_KEY;
  const r = await f.request("new", "/api/account", {
    method: "POST",
    body: {
      action: "request",
      role: "candidate",
      email: "new@example.invalid",
      fullName: "New User",
      processing: true,
    },
  });
  statuses(r, 503);
  assert.equal(count(f, "members"), 0);
  assert.equal(f.mail.length, 0);
});
test("OTP wrong owner cannot consume another principal challenge", async (f) => {
  const c = await f.challenge("alice");
  statuses(await f.verify("bob", c), 409);
  assert.equal(count(f, "members"), 0);
  statuses(await f.verify("alice", c), 200);
  assert.equal(count(f, "members"), 1);
  assert.equal(count(f, "candidates"), 1);
  assert.ok(!f.member("bob"));
});
test("OTP replay creates no duplicate membership/profile", async (f) => {
  const c = await f.challenge("alice");
  statuses(await f.verify("alice", c), 200);
  statuses(await f.verify("alice", c), 409);
  assert.equal(count(f, "members"), 1);
  assert.equal(count(f, "candidates"), 1);
});
test("OTP concurrent verify has one successful consumption", async (f) => {
  const c = await f.challenge("alice");
  const r = await Promise.all([f.verify("alice", c), f.verify("alice", c)]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  assert.equal(count(f, "members"), 1);
  assert.equal(count(f, "candidates"), 1);
});
test("OTP expires even when the submitted code is correct", async (f) => {
  const c = await f.challenge("alice");
  f.sqlite
    .prepare("UPDATE email_challenges SET expires_at=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", c.challengeId);
  statuses(await f.verify("alice", c), 409);
  assert.equal(count(f, "members"), 0);
});
test("Five wrong OTP attempts exhaust a challenge", async (f) => {
  const c = await f.challenge("alice");
  const zero = "0".repeat(c.code.length);
  const wrong = {
    ...c,
    code: c.code === zero ? "1".repeat(c.code.length) : zero,
  };
  for (let i = 0; i < 5; i++) statuses(await f.verify("alice", wrong), 422);
  statuses(await f.verify("alice", c), 409);
  assert.equal(count(f, "members"), 0);
});
test("OTP resend invalidates the old role/email challenge", async (f) => {
  const old = await f.challenge("alice", "candidate", "old@example.invalid");
  const fresh = await f.challenge("alice", "employer", "new@example.invalid");
  statuses(await f.verify("alice", old), 409);
  statuses(await f.verify("alice", fresh), 200);
  assert.equal(f.member("alice").role, "employer");
  assert.equal(f.member("alice").email, "new@example.invalid");
  assert.equal(count(f, "candidates"), 0);
});
test("Rejected provider delivery never grants a member", async (f) => {
  f.mailFailure = true;
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  statuses(
    await f.request("alice", "/api/account", {
      method: "POST",
      body: {
        action: "request",
        role: "candidate",
        email: "alice@example.invalid",
        fullName: "Alice Test",
        processing: true,
      },
    }),
    503,
  );
  assert.equal(count(f, "members"), 0);
  const r = f.sqlite.prepare("SELECT id FROM email_challenges").get();
  if (r)
    statuses(
      await f.verify("alice", { challengeId: r.id, code: f.mail[0].code }),
      409,
    );
});
test("Email uniqueness does not merge distinct session principals", async (f) => {
  const a = await f.challenge("alice", "candidate", "shared@example.invalid");
  const b = await f.challenge("bob", "employer", "shared@example.invalid");
  statuses(await f.verify("alice", a), 200);
  statuses(await f.verify("bob", b), 409);
  assert.equal(count(f, "members"), 1);
  assert.ok(!f.member("bob"));
  assert.equal(count(f, "companies"), 0);
});
test("Live candidates see only their own profile and cannot read another FSP view", async (f) => {
  const { a, b } = await pair(f);
  const state = await f.request("candidate-a", "/api/live/v1/state");
  statuses(state, 200);
  assert.deepEqual(
    state.value.candidates.map((c) => c.id),
    [a.id],
  );
  assert.equal(state.value.demoPersonas.length, 0);
  assert.equal(state.value.session.mode, "live");
  statuses(
    await f.request("candidate-a", "/api/live/v1/candidates/" + b.id),
    403,
  );
  statuses(
    await f.request("candidate-a", "/api/live/v1/fsp/participants/" + b.id),
    403,
  );
});
test("Live forbids demo role switching and never imports seeded qualifications", async (f) => {
  await f.enroll("candidate-a", "candidate");
  statuses(
    await f.request("candidate-a", "/api/live/v1/session", {
      method: "POST",
      body: { role: "employer", candidateId: "demo-candidate-001" },
    }),
    403,
  );
  statuses(
    await f.request("candidate-a", "/api/live/v1/onboarding", {
      method: "POST",
      body: {
        fullName: "Another candidate",
        processing: true,
        publication: true,
      },
    }),
    403,
  );
  assert.equal(f.member("candidate-a").role, "candidate");
  assert.ok(!f.candidate("candidate-a").qualification);
  assert.equal(count(f, "demo_accounts"), 0);
});
test("Live assessment history, drafts and submission remain candidate-owned", async (f) => {
  await f.enroll("candidate-a", "candidate");
  await f.enroll("candidate-b", "candidate");
  await f.enroll("employer-a", "employer");
  const input = {
    role: "Frontend",
    grade: "Junior",
    industry: "ИТ",
    motivation: "Проверить профессиональные знания",
  };
  const ra = await f.request("candidate-a", "/api/live/v1/assessments", {
    method: "POST",
    body: input,
  });
  const rb = await f.request("candidate-b", "/api/live/v1/assessments", {
    method: "POST",
    body: input,
  });
  statuses(ra, 201);
  statuses(rb, 201);
  const a = ra.value.assessments[0],
    b = rb.value.assessments[0];
  assert.notEqual(a.id, b.id);
  assert.equal(ra.value.assessments.length, 1);
  assert.equal(rb.value.assessments.length, 1);
  noField(a, "answer_key");
  noField(a, "keys");
  noField(a, "resultNonce");
  assert.deepEqual(
    (await f.request("employer-a", "/api/live/v1/state")).value.assessments,
    [],
  );
  const ownDraft = { [a.questions[0].id]: a.questions[0].options[0].id };
  statuses(
    await f.request(
      "candidate-a",
      "/api/live/v1/assessments/" + a.id + "/draft",
      { method: "PUT", body: { answers: ownDraft } },
    ),
    200,
  );
  statuses(
    await f.request("candidate-b", "/api/live/v1/assessments/" + a.id, {
      method: "POST",
      body: { answers: {} },
    }),
    404,
  );
  statuses(
    await f.request(
      "candidate-b",
      "/api/live/v1/assessments/" + a.id + "/draft",
      { method: "PUT", body: { answers: {} } },
    ),
    404,
  );
  assert.equal(
    f.sqlite.prepare("SELECT status FROM assessments WHERE id=?").get(a.id)
      .status,
    "active",
  );
  assert.deepEqual(
    JSON.parse(
      f.sqlite.prepare("SELECT data FROM assessments WHERE id=?").get(a.id)
        .data,
    ).draftAnswers,
    ownDraft,
  );
});
test("Live employers list/update only their own jobs", async (f) => {
  await pair(f);
  const a = await createJob(f, "employer-a"),
    b = await createJob(f, "employer-b");
  const state = await f.request("employer-a", "/api/live/v1/state");
  statuses(state, 200);
  assert.deepEqual(
    state.value.jobs.map((j) => j.id),
    [a],
  );
  statuses(
    await f.request("employer-a", "/api/live/v1/jobs/" + b, {
      method: "PATCH",
      body: { status: "archived" },
    }),
    [403, 404, 409],
  );
  assert.equal(
    JSON.parse(f.sqlite.prepare("SELECT data FROM jobs WHERE id=?").get(b).data)
      .status,
    "active",
  );
});
test("Live offer creation rejects another employer job", async (f) => {
  const { a } = await pair(f);
  const bJob = await createJob(f, "employer-b");
  statuses(
    await f.request("employer-a", "/api/live/v1/offers", {
      method: "POST",
      body: offerInput(a.id, bJob),
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),
    [403, 404, 409],
  );
  assert.equal(count(f, "offers"), 0);
});
test("Ad-hoc pending offers are unique per employer, not per entire live space", async (f) => {
  const { a } = await pair(f);
  await Promise.all([
    createOffer(f, "employer-a", a.id),
    createOffer(f, "employer-b", a.id),
  ]);
  assert.equal(count(f, "offers"), 2);
});
test("Offer ownership prevents cross-company withdrawal and cross-candidate acceptance", async (f) => {
  const { a } = await pair(f);
  const offer = await createOffer(f, "employer-a", a.id);
  statuses(
    await f.request("employer-b", "/api/live/v1/offers/" + offer, {
      method: "PATCH",
      body: { status: "withdrawn" },
    }),
    [403, 404, 409],
  );
  statuses(
    await f.request("candidate-b", "/api/live/v1/offers/" + offer, {
      method: "PATCH",
      body: { status: "accepted" },
    }),
    [403, 404, 409],
  );
  assert.equal(
    f.sqlite.prepare("SELECT status FROM offers WHERE id=?").get(offer).status,
    "pending",
  );
});
test("Accepted candidate contact is disclosed only to its own employer", async (f) => {
  const { a } = await pair(f);
  const first = await createOffer(f, "employer-a", a.id);
  await createOffer(f, "employer-b", a.id);
  statuses(
    await f.request("candidate-a", "/api/live/v1/offers/" + first, {
      method: "PATCH",
      body: { status: "accepted" },
    }),
    200,
  );
  const sa = (await f.request("employer-a", "/api/live/v1/state")).value,
    sb = (await f.request("employer-b", "/api/live/v1/state")).value;
  assert.equal(sa.candidates.find((c) => c.id === a.id).contact, a.contact);
  assert.equal(sa.offers[0].candidateContact, a.contact);
  noField(
    sb.candidates.find((c) => c.id === a.id),
    "contact",
  );
  assert.ok(sb.offers.every((o) => !o.candidateContact));
});
test("Revoked processing removes an already accepted contact", async (f) => {
  const { a } = await pair(f);
  const offer = await createOffer(f, "employer-a", a.id);
  statuses(
    await f.request("candidate-a", "/api/live/v1/offers/" + offer, {
      method: "PATCH",
      body: { status: "accepted" },
    }),
    200,
  );
  const updated = profileInput(f.candidate("candidate-a"));
  updated.privacy.processing = false;
  updated.privacy.publication = false;
  statuses(
    await f.request("candidate-a", "/api/live/v1/profile", {
      method: "PATCH",
      body: updated,
      headers: { "If-Match": "0" },
    }),
    200,
  );
  const state = (await f.request("employer-a", "/api/live/v1/state")).value;
  assert.ok(!state.candidates.some((c) => c.id === a.id));
  assert.ok(state.offers.every((o) => !o.candidateContact));
});
test("Resource idempotency never treats another employer resource as a successful retry", async (f) => {
  const { a } = await pair(f);
  const shared = crypto.randomUUID();
  await createJob(f, "employer-a", shared);
  statuses(
    await f.request("employer-b", "/api/live/v1/jobs", {
      method: "POST",
      body: jobInput,
      headers: { "Idempotency-Key": shared },
    }),
    409,
  );
  assert.equal(count(f, "jobs"), 1);
  const offerId = await createOffer(f, "employer-a", a.id);
  statuses(
    await f.request("employer-b", "/api/live/v1/offers", {
      method: "POST",
      body: offerInput(a.id),
      headers: { "Idempotency-Key": offerId },
    }),
    409,
  );
  assert.equal(count(f, "offers"), 1);
});
test("Demo and live company/favorites namespaces remain separate", async (f) => {
  const { a } = await pair(f);
  statuses(await f.request("employer-a", "/api/v1/state"), 200);
  const data = {
    name: "Live Company",
    industry: "ИТ",
    description: "Описание отдельной компании рабочего аккаунта.",
    contact: "live@example.invalid",
  };
  statuses(
    await f.request("employer-a", "/api/live/v1/company", {
      method: "PATCH",
      body: data,
    }),
    200,
  );
  assert.equal(
    (await f.request("employer-a", "/api/live/v1/state")).value.company.name,
    "Live Company",
  );
  assert.notEqual(
    (await f.request("employer-a", "/api/v1/state")).value.company.name,
    "Live Company",
  );
  f.sqlite
    .prepare("INSERT INTO favorites(owner,candidate_id) VALUES(?,?)")
    .run(owner("employer-a"), a.id);
  assert.ok(
    !(await f.request("employer-a", "/api/v1/state")).value.favorites.includes(
      a.id,
    ),
  );
});
test("Live profile cannot overwrite authoritative qualification via request body", async (f) => {
  await f.enroll("candidate-a", "candidate");
  const c = f.candidate("candidate-a");
  statuses(
    await f.request("candidate-a", "/api/live/v1/profile", {
      method: "PATCH",
      body: {
        ...profileInput(c),
        qualification: { role: "Backend", grade: "Senior", score: 100 },
      },
      headers: { "If-Match": "0" },
    }),
    422,
  );
  assert.ok(!f.candidate("candidate-a").qualification);
});
test("Live FSP import is closed until identity ownership proof exists", async (f) => {
  await f.enroll("candidate-a", "candidate");
  const networkBefore = f.network.length;
  statuses(
    await f.request("candidate-a", "/api/live/v1/profile/sync", {
      method: "POST",
      body: {},
    }),
    409,
  );
  assert.equal(f.network.length, networkBefore);
  assert.deepEqual(f.candidate("candidate-a").achievements, []);
});
test("Read-only key scopes reject ungranted resources", async (f) => {
  await pair(f);
  const key = await f.key("employer-a", ["jobs:read"]);
  statuses(await f.connected(null, key, "jobs"), 200);
  statuses(await f.connected(null, key, "candidates"), 403);
  statuses(await f.connected(null, key, "offers"), 403);
  const rows = await f.request("employer-a", "/api/integrations?mode=live");
  statuses(rows, 200);
  assert.ok(rows.value.keys.every((k) => !k.token && !k.hash));
});
test("API keys expose only issuer jobs/offers and strip all direct contacts", async (f) => {
  const { a } = await pair(f);
  const ja = await createJob(f, "employer-a");
  await createJob(f, "employer-b");
  const oa = await createOffer(f, "employer-a", a.id, ja);
  await createOffer(f, "employer-b", a.id);
  statuses(
    await f.request("candidate-a", "/api/live/v1/offers/" + oa, {
      method: "PATCH",
      body: { status: "accepted" },
    }),
    200,
  );
  const key = await f.key("employer-a");
  const jobs = await f.connected(null, key, "jobs"),
    offers = await f.connected(null, key, "offers"),
    candidates = await f.connected(null, key, "candidates");
  for (const result of [jobs, offers, candidates]) statuses(result, 200);
  assert.deepEqual(
    jobs.value.items.map((x) => x.id),
    [ja],
  );
  assert.deepEqual(
    offers.value.items.map((x) => x.id),
    [oa],
  );
  for (const o of offers.value.items)
    for (const k of ["candidateContact", "employerContact", "message"])
      noField(o, k);
  for (const c of candidates.value.items)
    for (const k of ["contact", "privacy", "fspId"]) noField(c, k);
  assert.ok(
    f.sqlite.prepare("SELECT hash FROM api_keys WHERE id=?").get(key.id)
      .hash !== key.token,
    "Raw key was persisted",
  );
  const mixedIdentity = await f.connected("employer-b", key, "jobs");
  statuses(mixedIdentity, 200);
  assert.deepEqual(
    mixedIdentity.value.items.map((x) => x.id),
    [ja],
  );
});
test("A different employer cannot revoke another issuer key", async (f) => {
  await pair(f);
  const key = await f.key("employer-a");
  statuses(
    await f.request("employer-b", "/api/integrations?mode=live", {
      method: "POST",
      body: { action: "revoke", id: key.id },
    }),
    404,
  );
  statuses(await f.connected(null, key), 200);
});
test("Key revocation and expiry are enforced on the next request", async (f) => {
  await pair(f);
  const key = await f.key("employer-a");
  statuses(
    await f.request("employer-a", "/api/integrations?mode=live", {
      method: "POST",
      body: { action: "revoke", id: key.id },
    }),
    200,
  );
  statuses(await f.connected(null, key), 401);
  const other = await f.key("employer-a");
  f.sqlite
    .prepare("UPDATE api_keys SET expires_at=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", other.id);
  statuses(await f.connected(null, other), 401);
});
test("Invalid bearer never falls back to valid session identity", async (f) => {
  await pair(f);
  statuses(
    await f.request("employer-a", "/api/connect/v1/candidates", {
      headers: { Authorization: "Bearer invalid-test-value" },
    }),
    401,
  );
  statuses(await f.request("employer-a", "/api/connect/v1/candidates"), 401);
});
test("A read key cannot request state, extra route segments or writes", async (f) => {
  await pair(f);
  const key = await f.key("employer-a");
  statuses(await f.connected(null, key, "state"), 404);
  statuses(await f.connected(null, key, "candidates/anything"), 404);
  await f.run(null, () =>
    assert.rejects(
      () =>
        api.apiAccess.connectedRead(
          new Request(ORIGIN + "/api/connect/v1/offers", {
            method: "POST",
            headers: { Authorization: "Bearer " + key.token },
          }),
          "offers",
        ),
      (e) => e.status === 405,
    ),
  );
  assert.equal(typeof api.connect.POST, "undefined");
});
test("Candidate membership cannot issue integration keys", async (f) => {
  await f.enroll("candidate-a", "candidate");
  statuses(
    await f.request("candidate-a", "/api/integrations?mode=live", {
      method: "POST",
      body: {
        action: "create",
        name: "Not allowed",
        scopes: ["jobs:read"],
        expiresInDays: 1,
      },
    }),
    403,
  );
  assert.equal(count(f, "api_keys"), 0);
});
test("Integration key creation observes session revision at the SQL write", async (f) => {
  await f.enroll("employer-a", "employer");
  let changed = false;
  f.beforeRun = (sql) => {
    if (!changed && /^INSERT(?: OR IGNORE)? INTO api_keys/i.test(sql)) {
      changed = true;
      f.sqlite
        .prepare("UPDATE members SET revision=revision+1 WHERE owner=?")
        .run(owner("employer-a"));
    }
  };
  const r = await f.request("employer-a", "/api/integrations?mode=live", {
    method: "POST",
    body: {
      action: "create",
      name: "Revision race",
      scopes: ["jobs:read"],
      expiresInDays: 1,
    },
  });
  assert.ok(changed, "Key INSERT hook was not exercised");
  statuses(r, [403, 409]);
  assert.equal(count(f, "api_keys"), 0);
});
test("Concurrent key creates cannot exceed ten active keys", async (f) => {
  await f.enroll("employer-a", "employer");
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  for (let i = 0; i < 9; i++)
    f.sqlite
      .prepare(
        "INSERT INTO api_keys(id,owner,data_owner,mode,name,hash,scopes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        crypto.randomUUID(),
        owner("employer-a"),
        LIVE,
        "live",
        "Fixture " + i,
        "fixture-hash-" + i,
        JSON.stringify(["jobs:read"]),
        NOW(),
        future(),
      );
  const payload = {
    method: "POST",
    body: {
      action: "create",
      name: "Concurrent create",
      scopes: ["jobs:read"],
      expiresInDays: 1,
    },
  };
  const rows = await Promise.all([
    f.request("employer-a", "/api/integrations?mode=live", payload),
    f.request("employer-a", "/api/integrations?mode=live", payload),
  ]);
  assert.deepEqual(rows.map((x) => x.status).sort(), [201, 409]);
  assert.equal(count(f, "api_keys"), 10);
});
test("JSON body limit cancels streaming input before fully consuming it", async (f) => {
  let pulls = 0,
    cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      pulls++;
      if (pulls > 100) controller.close();
      else controller.enqueue(new Uint8Array(4096).fill(32));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request(ORIGIN + "/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  });
  await f.run("alice", () =>
    assert.rejects(
      () => api.security.readJson(request),
      (e) => e.status === 413,
    ),
  );
  assert.ok(
    cancelled && pulls < 100,
    "Body limit was checked only after reading the entire stream",
  );
});

const urlCases = [
  ["fixed https origin", "https://api.example.org/v1", "api.example.org", true],
  [
    "explicit standard port",
    "https://api.example.org:443/v1",
    "api.example.org",
    true,
  ],
  ["case normalization", "https://API.EXAMPLE.ORG/v1", "api.example.org", true],
  [
    "valid digit-prefixed domain",
    "https://3.api.example.org/v1",
    "3.api.example.org",
    true,
  ],
  ["http forbidden", "http://api.example.org/v1", "api.example.org", false],
  [
    "userinfo forbidden",
    "https://user:pass@api.example.org/v1",
    "api.example.org",
    false,
  ],
  [
    "query forbidden",
    "https://api.example.org/v1?url=https://elsewhere.invalid",
    "api.example.org",
    false,
  ],
  [
    "fragment forbidden",
    "https://api.example.org/v1#x",
    "api.example.org",
    false,
  ],
  [
    "host mismatch",
    "https://api.example.org.attacker.invalid/v1",
    "api.example.org",
    false,
  ],
  ["localhost", "https://localhost/v1", "localhost", false],
  ["local suffix", "https://api.local/v1", "api.local", false],
  ["internal suffix", "https://api.internal/v1", "api.internal", false],
  ["localhost with trailing dot", "https://localhost./v1", "localhost.", false],
  [
    "internal suffix with trailing dot",
    "https://provider.internal./v1",
    "provider.internal.",
    false,
  ],
  ["IPv4 loopback", "https://127.0.0.1/v1", "127.0.0.1", false],
  ["alternate IPv4 notation", "https://0x7f000001/v1", "127.0.0.1", false],
  ["IPv4 private", "https://10.0.0.1/v1", "10.0.0.1", false],
  ["IPv6 loopback", "https://[::1]/v1", "[::1]", false],
  [
    "nonstandard port",
    "https://api.example.org:8443/v1",
    "api.example.org",
    false,
  ],
  ["protocol relative", "//api.example.org/v1", "api.example.org", false],
];
for (const [name, base, allowedHost, valid] of urlCases)
  test("FSP URL: " + name, async () => {
    if (valid)
      assert.ok(api.fsp.validateFspUrl(base, allowedHost) instanceof URL);
    else
      assert.throws(
        () => api.fsp.validateFspUrl(base, allowedHost),
        (e) => e.status === 422,
      );
  });
test("FSP probe rejects participant path injection before making a request", async (f) => {
  f.env.FSP_API_BASE_URL = "https://api.example.org/v1";
  f.env.FSP_API_ALLOWED_HOST = "api.example.org";
  for (const id of [
    "../admin",
    "a/b",
    "a\\b",
    "%2fadmin",
    "//localhost",
    "https://localhost",
    "a?x=1",
  ])
    await f.run(null, () => assert.rejects(() => api.fsp.probeFsp(id)));
  assert.equal(f.network.length, 0);
});
test("FSP probe checks a bounded response without importing or verifying identity", async (f) => {
  f.env.FSP_API_BASE_URL = "https://api.example.org/v1";
  f.env.FSP_API_ALLOWED_HOST = "api.example.org";
  f.fspResponder = (u, init) => {
    assert.equal(u.pathname, "/v1/participants/person_1/achievements");
    assert.equal(init.redirect, "error");
    return Response.json({ participantId: "person_1", achievements: [] });
  };
  const r = await f.run(null, () => api.fsp.probeFsp("person_1"));
  assert.equal(r.count, 0);
  assert.equal(r.identityVerified, false);
  assert.equal(count(f, "candidates"), 0);
});
test("FSP redirects and mismatched participant responses fail", async (f) => {
  f.env.FSP_API_BASE_URL = "https://api.example.org";
  f.env.FSP_API_ALLOWED_HOST = "api.example.org";
  f.fspResponder = (_u, init) => {
    assert.equal(init.redirect, "error");
    return new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1" },
    });
  };
  await f.run(null, () =>
    assert.rejects(
      () => api.fsp.probeFsp("one"),
      (e) => e.status === 502,
    ),
  );
  assert.equal(f.network.length, 1);
  f.fspResponder = () =>
    Response.json({ participantId: "other", achievements: [] });
  await f.run(null, () =>
    assert.rejects(
      () => api.fsp.probeFsp("one"),
      (e) => e.status === 502,
    ),
  );
});
test("FSP oversized or malformed response is rejected", async (f) => {
  f.env.FSP_API_BASE_URL = "https://api.example.org";
  f.env.FSP_API_ALLOWED_HOST = "api.example.org";
  f.fspResponder = () =>
    new Response(" ".repeat(262145), {
      headers: { "Content-Type": "application/json" },
    });
  await f.run(null, () =>
    assert.rejects(
      () => api.fsp.probeFsp("one"),
      (e) => e.status === 502,
    ),
  );
  f.fspResponder = () =>
    Response.json({
      participantId: "one",
      achievements: [
        {
          id: "x",
          competition: "One",
          discipline: "coding",
          place: 5,
          participants: 2,
          year: 2025,
          teamRole: "member",
        },
      ],
    });
  await f.run(null, () =>
    assert.rejects(
      () => api.fsp.probeFsp("one"),
      (e) => e.status === 502,
    ),
  );
});

let failures = 0;
try {
  for (const { name, fn } of tests) {
    const f = fixture();
    try {
      await fn(f);
      console.log("PASS " + name);
    } catch (e) {
      failures++;
      const message = String(e?.message ?? e)
        .replace(/pf_[a-f0-9]{64}/g, "[redacted-test-key]")
        .slice(0, 550);
      console.error("FAIL " + name + " :: " + message);
    } finally {
      f.sqlite.close();
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__v3ReviewContext;
}
console.log(
  JSON.stringify({
    suite: "v3-security",
    tests: tests.length,
    passed: tests.length - failures,
    failed: failures,
    network: "stub-only",
    database: "in-memory",
    checkoutWrites: false,
  }),
);
if (failures) process.exitCode = 1;
