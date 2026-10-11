/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

/**
 * v5 security regression. Run: node v5-security.mjs <platform-dir>
 * Actual routes + migrations; esbuild write:false; SQLite :memory:; no network.
 * No checkout writes, provider calls or persisted test databases.
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
const contexts = new AsyncLocalStorage();
globalThis.__featureReviewContext = contexts;
const compiled = await build({
  absWorkingDir: project,
  stdin: {
    resolveDir: project,
    sourcefile: "feature-review.ts",
    contents: `
  export * as route from './app/api/v1/[...path]/route';
  export * as career from './app/api/v2/[...path]/route';
  export * as signals from './app/api/v3/[...path]/route';
  export * as liveSignals from './app/api/live/v3/[...path]/route';
  export * as signalsDomain from './lib/signals-domain';
  export {defaultFilters} from './lib/types';

`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
  plugins: [
    {
      name: "feature-review",
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
          path: path.join(
            project,
            x.path.slice(2) + (x.path.endsWith(".json") ? "" : ".ts"),
          ),
        }));
        b.onLoad({ filter: /.*/, namespace: "review" }, (x) => ({
          loader: "js",
          contents:
            x.path === "env"
              ? "export const env=new Proxy({},{get(_,key){return globalThis.__featureReviewContext.getStore().fixture.env[key]}});"
              : "export async function getCurrentUser(){return globalThis.__featureReviewContext.getStore().user}",
        }));
      },
    },
  ],
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  contexts.getStore().fixture.networkCalls++;
  throw new Error("Outbound network disabled in signals suite");
};
const ORIGIN = "https://feature-review.invalid",
  LIVE = "live-profectium-v1";
const now = () => new Date().toISOString();

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs
    .readdirSync(path.join(project, "drizzle"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(fs.readFileSync(path.join(project, "drizzle", file), "utf8"));
  const f = { sqlite, beforeRun: null, afterFirst: null, networkCalls: 0 };
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      const row = sqlite.prepare(this.sql).get(...this.args) ?? null;
      f.afterFirst?.(this.sql, this.args, row);
      return row;
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
        sqlite.exec("BEGIN");
        try {
          const r = statements.map((s) => s.execute());
          sqlite.exec("COMMIT");
          return r;
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      },
    },
  };
  f.request = async (
    id,
    route,
    {
      method = "GET",
      body,
      headers = {},
      demo = false,
      version = 3,
      authenticated = true,
    } = {},
  ) =>
    contexts.run(
      {
        fixture: f,
        user: authenticated
          ? { userId: id, email: id + "@example.invalid" }
          : null,
      },
      async () => {
        const owner = demo ? id : "live:" + id;
        const account = sqlite
          .prepare(
            `SELECT revision FROM ${demo ? "demo_accounts" : "members"} WHERE owner=?`,
          )
          .get(owner);
        const req = new Request(
          ORIGIN + (demo ? "/api/v" : "/api/live/v") + version + "/" + route,
          {
            method,
            headers: {
              Origin: ORIGIN,
              "Content-Type": "application/json",
              "X-Session-Revision": String(account?.revision ?? 0),
              ...headers,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        );
        const response = await (
          version === 3
            ? demo
              ? api.signals
              : api.liveSignals
            : version === 2
              ? api.career
              : api.route
        )[method](req, {
          params: Promise.resolve({ path: route.split("?")[0].split("/") }),
        });
        const text = await response.text();
        let value = text;
        try {
          value = JSON.parse(text);
        } catch {}
        return { status: response.status, value, headers: response.headers };
      },
    );
  f.member = (id, role = "candidate", qualified = false) => {
    const candidateId = role === "candidate" ? crypto.randomUUID() : "";
    sqlite
      .prepare(
        "INSERT INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) VALUES(?,?,?,?,?,?,0)",
      )
      .run(
        "live:" + id,
        role,
        candidateId,
        id + "@example.invalid",
        "Test " + id,
        now(),
      );
    if (role === "candidate") {
      const c = {
        id: candidateId,
        fullName: "Candidate " + id,
        initials: "TC",
        role: "Frontend",
        grade: "Junior",
        city: "Москва",
        workFormat: "Удалённо",
        salaryMin: 80000,
        salaryMax: 140000,
        yearsExperience: 1,
        skills: ["TypeScript"],
        bio: "Описание опыта и выполненных учебных проектов.",
        softSkills: ["Командная работа"],
        contact: id + "@example.invalid",
        fspId: "",
        achievements: [],
        available: true,
        privacy: {
          processing: true,
          publication: true,
          showAchievements: true,
          consentAt: now(),
        },
      };
      if (qualified)
        c.qualification = {
          role: "Frontend",
          grade: "Junior",
          score: 83,
          passedAt: now(),
          nextChangeAt: new Date(Date.now() + 90 * 86400000).toISOString(),
          attemptId: crypto.randomUUID(),
          synthetic: false,
        };
      sqlite
        .prepare(
          "INSERT INTO candidates(owner,id,data,revision) VALUES(?,?,?,0)",
        )
        .run(LIVE, candidateId, JSON.stringify(c));
    } else
      sqlite.prepare("INSERT INTO companies(owner,data) VALUES(?,?)").run(
        "live:" + id,
        JSON.stringify({
          name: "Company " + id,
          industry: "ИТ",
          description: "Рабочая компания для проверки инвариантов.",
          contact: id + "@example.invalid",
        }),
      );
    return candidateId;
  };
  f.readCandidate = (id) => {
    const row = sqlite
      .prepare("SELECT data,revision FROM candidates WHERE owner=? AND id=?")
      .get(LIVE, id);
    return { ...JSON.parse(row.data), revision: row.revision };
  };
  f.insertAttempt = (candidateId, assessment, keys) =>
    sqlite
      .prepare(
        "INSERT INTO assessments(owner,id,candidate_id,role,grade,data,answer_key,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        LIVE,
        assessment.id,
        candidateId,
        assessment.role,
        assessment.grade,
        JSON.stringify(assessment),
        JSON.stringify(keys),
        assessment.status,
        assessment.createdAt,
      );
  return f;
}

// Original v5 checks. Harness reused from this project's v4 suite; no third-party tests.
const uuid = () => crypto.randomUUID();
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const expect = (r, n) =>
  assert.equal(
    r.status,
    n,
    `Expected ${n}; got ${r.status}: ${JSON.stringify(r.value).slice(0, 600)}`,
  );
function actors(f) {
  f.member("ea", "employer");
  f.member("eb", "employer");
  f.ca = f.member("ca", "candidate", true);
  f.cb = f.member("cb", "candidate", true);
  return f;
}
const privateKinds = new Set(["radar", "source", "listing", "import", "done"]);
const row = (f, kind, id, actor = "ea") =>
  f.sqlite
    .prepare("SELECT * FROM career_records WHERE owner=? AND kind=? AND id=?")
    .get(privateKinds.has(kind) ? "live:" + actor : LIVE, kind, id);
const value = (f, kind, id, actor = "ea") =>
  JSON.parse(row(f, kind, id, actor).data);
const count = (f, kind, actor = "ea") =>
  Number(
    f.sqlite
      .prepare("SELECT COUNT(*) n FROM career_records WHERE owner=? AND kind=?")
      .get(privateKinds.has(kind) ? "live:" + actor : LIVE, kind).n,
  );
const mutate = (f, id, fn) => {
  const c = f.readCandidate(id);
  delete c.revision;
  fn(c);
  f.sqlite
    .prepare(
      "UPDATE candidates SET data=?,revision=revision+1 WHERE owner=? AND id=?",
    )
    .run(JSON.stringify(c), LIVE, id);
};
const filters = (v = {}) => ({ ...api.defaultFilters, jobId: "", ...v });
async function state(f, actor = "ea", opts = {}) {
  const r = await f.request(actor, "state", opts);
  expect(r, 200);
  return r.value;
}
async function radar(f, fs = filters(), actor = "ea") {
  const id = uuid();
  expect(
    await f.request(actor, "radars", {
      method: "POST",
      body: { id, data: { title: "Проверяемый радар", filters: fs } },
    }),
    201,
  );
  return id;
}
async function source(f, actor = "ea") {
  const id = uuid();
  expect(
    await f.request(actor, "sources", {
      method: "POST",
      body: {
        id,
        data: {
          name: "Источник тестового работодателя",
          website: "https://jobs.example.org",
          category: "company",
        },
      },
    }),
    201,
  );
  return id;
}
const item = (v = {}) => ({
  externalId: "one",
  title: "Frontend developer",
  company: "Test Company",
  url: "https://jobs.example.org/positions/one",
  role: "Frontend",
  grade: "Junior",
  workFormat: "Удалённо",
  employment: "job",
  salaryMin: 80000,
  salaryMax: 140000,
  skills: ["TypeScript"],
  description:
    "A sufficiently long and concrete statement describing actual work, the team context, the expected result and the conditions of this role.",
  publishedAt: new Date(Date.now() - 86400000).toISOString(),
  ...v,
});
async function preview(f, s, items = [item()], actor = "ea") {
  const r = await f.request(actor, "imports/preview", {
    method: "POST",
    body: {
      sourceId: s,
      sourceRevision: row(f, "source", s, actor).revision,
      items,
    },
  });
  expect(r, 201);
  return r.value.preview;
}
async function commit(f, p, actor = "ea", revision = p.revision) {
  return f.request(actor, "imports/" + p.id + "/commit", {
    method: "POST",
    body: { revision },
  });
}
async function offer(f, status = "accepted", overrides = {}) {
  const id = uuid();
  expect(
    await f.request("ea", "offers", {
      version: 1,
      method: "POST",
      headers: { "Idempotency-Key": id },
      body: {
        candidateId: f.ca,
        jobId: "",
        jobTitle: "Работа с конкретными задачами",
        employerContact: "employer@example.invalid",
        salaryMin: 120000,
        salaryMax: 150000,
        workFormat: "Удалённо",
        coreHours: "10:00–16:00",
        onCall: "no",
        message:
          "A concrete proposal with enough context to accept and review.",
        ...overrides,
      },
    }),
    201,
  );
  if (status !== "pending")
    expect(
      await f.request("ca", "offers/" + id, {
        version: 1,
        method: "PATCH",
        body: { status },
      }),
      200,
    );
  return id;
}
const planBody = (id) => ({
  offerId: id,
  startDate: new Date().toISOString().slice(0, 10),
  milestones: [
    "Первый конкретный результат за тридцать дней",
    "Второй конкретный результат за шестьдесят дней",
    "Третий конкретный результат за девяносто дней",
  ],
});
// Historic records are seeded directly to verify retirement never deletes user data.
async function legacyPlan(f) {
  const id = await offer(f);
  const body = planBody(id);
  const data = {
    offerId: id,
    title: "LEGACY_PLAN_DO_NOT_EXPOSE",
    startDate: body.startDate,
    steps: body.milestones.map((title, index) => ({
      id: "day-" + [30, 60, 90][index],
      day: [30, 60, 90][index],
      title,
      status: ["todo", "submitted", "done"][index],
      report: "Historic candidate report",
      feedback: "Historic employer feedback",
    })),
    history: [{ at: now(), by: "candidate", action: "submit", stepId: "day-60", note: "Historic report" }],
  };
  f.sqlite.prepare(
    "INSERT INTO career_records(owner,kind,id,candidate_id,employer_id,data,revision,created_at) VALUES(?,'plan',?,?,?,?,0,?)",
  ).run(LIVE, id, f.ca, "live:ea", JSON.stringify(data), now());
  return id;
}
async function verification(f, title = "Проверка работы с TypeScript") {
  const id = uuid();
  expect(await f.request("ea", "requests", {
    version: 2,
    method: "POST",
    body: {
      id,
      candidateId: f.ca,
      skill: "TypeScript",
      title,
      criteria: "Объяснить решение и подтвердить результат понятным примером.",
      estimatedMinutes: 20,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    },
  }), 201);
  return id;
}
async function dialogue(f) {
  const id = await offer(f, "pending");
  expect(await f.request("ea", "dialogues/" + id, {
    version: 2,
    method: "POST",
    body: { terms: {
      salaryMin: 120000,
      salaryMax: 150000,
      workFormat: "Удалённо",
      coreHours: "10:00–16:00",
      onCall: "no",
      firstMonths: "Разработать и проверить доступные интерфейсы продукта.",
      interviewSteps: "Обсудить технические задачи",
      reviewProcess: "Совместное ревью решений",
      mentoring: "Наставник на время знакомства с продуктом",
    } },
  }), 201);
  await nextStep(f, id);
  return id;
}
async function nextStep(f, id, action = "step") {
  expect(await f.request("ea", "dialogues/" + id, {
    version: 2,
    method: "PATCH",
    body: {
      revision: row(f, "dialogue", id).revision,
      action,
      note: "Обсудить результаты технического интервью и дать обратную связь.",
      ...(action === "step" ? { dueAt: new Date(Date.now() + 86400000).toISOString() } : {}),
    },
  }), 200);
}

/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */
test("01 authentication, enrollment, no-store and live mirror", async (f) => {
  actors(f);
  expect(await f.request("ea", "state", { authenticated: false }), 401);
  expect(await f.request("missing", "state"), 403);
  const r = await f.request("ea", "state");
  expect(r, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(r.value.sources, []);
});
test("02 mutation origin and exact session revision are enforced", async (f) => {
  actors(f);
  const body = {
    id: uuid(),
    data: { title: "A saved radar", filters: filters() },
  };
  expect(
    await f.request("ea", "radars", {
      method: "POST",
      body,
      headers: { Origin: "https://evil.example" },
    }),
    403,
  );
  expect(
    await f.request("ea", "radars", {
      method: "POST",
      body,
      headers: { "X-Session-Revision": "9" },
    }),
    409,
  );
  assert.equal(count(f, "radar"), 0);
});
test("03 candidate cannot access employer operations or export", async (f) => {
  actors(f);
  expect(
    await f.request("ca", "radars", {
      method: "POST",
      body: {
        id: uuid(),
        data: { title: "Forbidden radar", filters: filters() },
      },
    }),
    403,
  );
  expect(await f.request("ca", "sources", { method: "POST", body: {} }), 403);
  expect(
    await f.request("ca", "imports/preview", { method: "POST", body: {} }),
    403,
  );
  expect(await f.request("ca", "export"), 403);
  const s = await state(f, "ca");
  for (const k of ["radars", "sources", "listings", "imports"])
    assert.deepEqual(s[k], []);
});
test("04 private radar/source/import/listing IDs cannot cross employer scope", async (f) => {
  actors(f);
  const ra = await radar(f),
    s = await source(f),
    p = await preview(f, s);
  expect(await commit(f, p), 200);
  const li = p.rows[0].id;
  for (const [kind, id, body] of [
    ["radars", ra, { revision: 0, action: "pause" }],
    ["sources", s, { revision: 0, active: false }],
    ["listings", li, { revision: 0, review: "accepted" }],
  ])
    expect(
      await f.request("eb", kind + "/" + id, { method: "PATCH", body }),
      404,
    );
  expect(await commit(f, p, "eb"), 404);
  const b = await state(f, "eb");
  for (const k of ["radars", "sources", "listings", "imports"])
    assert.equal(b[k].length, 0);
});
test("05 same principal demo and live sources stay isolated", async (f) => {
  actors(f);
  const live = await source(f);
  await state(f, "ea", { demo: true });
  f.sqlite
    .prepare(
      "UPDATE demo_accounts SET role='employer',candidate_id='',revision=revision+1 WHERE owner=?",
    )
    .run("ea");
  const demoId = uuid();
  expect(
    await f.request("ea", "sources", {
      demo: true,
      method: "POST",
      body: {
        id: demoId,
        data: {
          name: "Отдельный демоисточник",
          website: "https://demo.example.org",
          category: "community",
        },
      },
    }),
    201,
  );
  assert.deepEqual(
    (await state(f)).sources.map((x) => x.id),
    [live],
  );
  assert.deepEqual(
    (await state(f, "ea", { demo: true })).sources.map((x) => x.id),
    [demoId],
  );
  expect(
    await f.request("ea", "sources/" + live, {
      demo: true,
      method: "PATCH",
      body: { revision: 0, active: false },
    }),
    404,
  );
});
test("06 default all-vacancies radar finds currently visible qualified candidates", async (f) => {
  actors(f);
  const id = await radar(f, { ...api.defaultFilters });
  const r = (await state(f)).radars.find((x) => x.id === id);
  assert.equal(r.total, 2, "jobId=all must mean no vacancy restriction");
  assert.deepEqual(new Set(r.ids), new Set([f.ca, f.cb]));
});
test("07 multiword search uses AND and skill aliases, not any-term OR", async (f) => {
  actors(f);
  mutate(f, f.ca, (c) => {
    c.skills = ["TypeScript", "React"];
  });
  mutate(f, f.cb, (c) => {
    c.skills = ["React"];
  });
  const id = await radar(f, filters({ query: "TS React" }));
  assert.deepEqual((await state(f)).radars.find((x) => x.id === id).ids, [
    f.ca,
  ]);
});
test("08 role, grade, format and salary constraints combine with query", async (f) => {
  actors(f);
  mutate(f, f.cb, (c) => {
    c.workFormat = "Офис";
    c.salaryMin = 300000;
  });
  const id = await radar(
    f,
    filters({
      query: "TypeScript",
      role: "Frontend",
      grade: "Junior",
      format: "Удалённо",
      maxSalary: "100000",
    }),
  );
  assert.deepEqual((await state(f)).radars.find((x) => x.id === id).ids, [
    f.ca,
  ]);
  const empty = await radar(
    f,
    filters({ query: "TypeScript", role: "Backend" }),
  );
  assert.equal((await state(f)).radars.find((x) => x.id === empty).total, 0);
});
test("09 radar history exposes hash-derived counts, acknowledge clears deltas", async (f) => {
  actors(f);
  const id = await radar(f);
  mutate(f, f.ca, (c) => {
    c.salaryMin = 90000;
  });
  let r = (await state(f)).radars.find((x) => x.id === id);
  assert.deepEqual(r.changed, [f.ca]);
  assert.equal(r.seen, undefined);
  assert.ok(
    Object.values(value(f, "radar", id).seen).every((h) =>
      /^[a-f0-9]{64}$/.test(h),
    ),
  );
  expect(
    await f.request("ea", "radars/" + id, {
      method: "PATCH",
      body: { revision: 0, action: "acknowledge" },
    }),
    200,
  );
  r = (await state(f)).radars.find((x) => x.id === id);
  assert.deepEqual(r.changed, []);
  assert.deepEqual(r.added, []);
});
test("10 anonymous identity and contact edits do not become radar changes", async (f) => {
  actors(f);
  mutate(f, f.ca, (c) => {
    c.controls = { anonymous: true, rules: { strict: false } };
  });
  const id = await radar(f);
  mutate(f, f.ca, (c) => {
    c.fullName = "PRIVATE_NAME_SENTINEL";
    c.contact = "PRIVATE_CONTACT_SENTINEL";
    c.bio = "PRIVATE_BIO_SENTINEL";
    c.city = "PRIVATE_CITY_SENTINEL";
  });
  const s = await state(f),
    r = s.radars.find((x) => x.id === id);
  assert.deepEqual(r.changed, []);
  const txt = JSON.stringify(s);
  for (const x of [
    "PRIVATE_NAME_SENTINEL",
    "PRIVATE_CONTACT_SENTINEL",
    "PRIVATE_BIO_SENTINEL",
    "PRIVATE_CITY_SENTINEL",
  ])
    assert.ok(!txt.includes(x));
});
test("11 withdrawn publication immediately removes IDs but only reports removed count", async (f) => {
  actors(f);
  const id = await radar(f);
  mutate(f, f.ca, (c) => {
    c.privacy.publication = false;
  });
  const s = await state(f),
    r = s.radars.find((x) => x.id === id);
  assert.equal(r.total, 1);
  assert.equal(r.removed, 1);
  assert.ok(!JSON.stringify(s).includes(f.ca));
  assert.deepEqual(r.changed, []);
  const x = await f.request(
    "ea",
    "export?filters=" + encodeURIComponent(JSON.stringify(filters())),
  );
  expect(x, 200);
  assert.ok(!x.value.includes("Candidate ca"));
});
test("12 stale, future and session-racing radar changes preserve the winner", async (f) => {
  actors(f);
  const id = await radar(f);
  expect(
    await f.request("ea", "radars/" + id, {
      method: "PATCH",
      body: { revision: 9, action: "pause" },
    }),
    409,
  );
  let injected = false;
  f.beforeRun = (sql) => {
    if (!injected && sql.startsWith("UPDATE career_records SET data=")) {
      injected = true;
      f.sqlite
        .prepare("UPDATE members SET revision=revision+1 WHERE owner=?")
        .run("live:ea");
    }
  };
  expect(
    await f.request("ea", "radars/" + id, {
      method: "PATCH",
      body: { revision: 0, action: "pause" },
    }),
    409,
  );
  assert.ok(injected);
  assert.equal(row(f, "radar", id).revision, 0);
  assert.equal(value(f, "radar", id).paused, false);
});
test("13 default export works with all-vacancies default filters", async (f) => {
  actors(f);
  const r = await f.request("ea", "export");
  expect(r, 200);
  assert.ok(r.value.includes("Candidate ca"));
});
test("14 CSV neutralizes formulas, quotes delimiters and omits contacts and hidden profiles", async (f) => {
  actors(f);
  mutate(f, f.ca, (c) => {
    c.fullName = '=HYPERLINK("https://evil.example")';
    c.skills = ["+danger", 'quoted;"value"'];
    c.contact = "CONTACT_EXPORT_SENTINEL";
  });
  mutate(f, f.cb, (c) => {
    c.privacy.processing = false;
    c.fullName = "HIDDEN_PROFILE_SENTINEL";
  });
  const r = await f.request(
    "ea",
    "export?filters=" + encodeURIComponent(JSON.stringify(filters())),
  );
  expect(r, 200);
  assert.ok(r.value.includes('"\'=HYPERLINK(""https://evil.example"")"'));
  assert.ok(r.value.includes('"\'+danger, quoted;""value"""'));
  assert.ok(!r.value.includes("CONTACT_EXPORT_SENTINEL"));
  assert.ok(!r.value.includes("HIDDEN_PROFILE_SENTINEL"));
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});
test("15 source URL and submitted payload validation reject executable/userinfo inputs", async (f) => {
  actors(f);
  for (const url of [
    "javascript:alert(1)",
    "https://u:p@jobs.example.org",
    "http://127.0.0.1/x",
    "http://localhost/x",
  ])
    expect(
      await f.request("ea", "sources", {
        method: "POST",
        body: {
          id: uuid(),
          data: { name: "Unsafe source", website: url, category: "company" },
        },
      }),
      422,
    );
  assert.equal(count(f, "source"), 0);
});
test("16 preview separates invalid and canonical duplicate rows while retaining valid rows", async (f) => {
  actors(f);
  const s = await source(f),
    base = item(),
    p = await preview(f, s, [
      base,
      item({ externalId: "two", url: base.url + "/?utm_source=test#frag" }),
      { bad: "shape" },
      item({ externalId: "offsite", url: "https://elsewhere.example.org/a" }),
    ]);
  assert.deepEqual(
    p.rows.map((x) => x.status),
    ["new", "duplicate", "invalid", "invalid"],
  );
  expect(await commit(f, p), 200);
  assert.equal(count(f, "listing"), 1);
});
test("17 import rejects invalid salaries, future dates, overlarge batches and unknown fields", async (f) => {
  actors(f);
  const s = await source(f),
    p = await preview(f, s, [
      item({ salaryMin: 200000, salaryMax: 100000 }),
      item({ salaryMin: null }),
      item({ publishedAt: "2099-01-01T00:00:00Z" }),
      item({ foreign: "not accepted" }),
    ]);
  assert.ok(p.rows.every((x) => x.status === "invalid"));
  expect(await commit(f, p), 422);
  expect(
    await f.request("ea", "imports/preview", {
      method: "POST",
      body: {
        sourceId: s,
        sourceRevision: 0,
        items: Array.from({ length: 31 }, (_, i) =>
          item({ externalId: String(i) }),
        ),
      },
    }),
    422,
  );
  assert.equal(count(f, "listing"), 0);
});
test("18 preview is nonmutating to listings and never fetches the supplied URL", async (f) => {
  actors(f);
  const s = await source(f),
    p = await preview(f, s, [
      item({
        url: "https://jobs.example.org/redirect?to=http://169.254.169.254/",
      }),
    ]);
  assert.equal(count(f, "listing"), 0);
  assert.equal(f.networkCalls, 0);
  expect(await commit(f, p), 200);
  assert.equal(f.networkCalls, 0);
});
test("19 commit retry is idempotent and tenant-scoped even when revisions differ", async (f) => {
  actors(f);
  const s = await source(f),
    p = await preview(f, s);
  expect(await commit(f, p), 200);
  const before = row(f, "listing", p.rows[0].id);
  expect(await commit(f, p), 200);
  assert.deepEqual(row(f, "listing", p.rows[0].id), before);
  assert.equal(count(f, "listing"), 1);
  expect(await commit(f, p, "eb"), 404);
});
test("20 changed import resets review; unchanged refresh preserves review and prior history", async (f) => {
  actors(f);
  const s = await source(f),
    base = item(),
    p = await preview(f, s, [base]);
  expect(await commit(f, p), 200);
  const id = p.rows[0].id;
  expect(
    await f.request("ea", "listings/" + id, {
      method: "PATCH",
      body: { revision: 0, review: "accepted" },
    }),
    200,
  );
  const unchanged = await preview(f, s, [
    { ...base, url: base.url + "?utm_campaign=x" },
  ]);
  assert.equal(unchanged.rows[0].status, "unchanged");
  expect(await commit(f, unchanged), 200);
  assert.equal(value(f, "listing", id).review, "accepted");
  const changed = await preview(f, s, [
    { ...base, title: "Changed concrete frontend position" },
  ]);
  assert.equal(changed.rows[0].status, "changed");
  expect(await commit(f, changed), 200);
  const next = value(f, "listing", id);
  assert.equal(next.review, "pending");
  assert.ok(next.history.at(-1).fields.includes("title"));
  assert.equal(count(f, "listing"), 1);
});
test("21 source revision race rejects the entire commit without mutating any listing", async (f) => {
  actors(f);
  const s = await source(f),
    p = await preview(f, s, [
      item(),
      item({ externalId: "two", url: "https://jobs.example.org/two" }),
    ]);
  let injected = false;
  f.beforeRun = (sql) => {
    if (!injected && sql.startsWith("UPDATE career_records SET data=")) {
      injected = true;
      f.sqlite
        .prepare(
          "UPDATE career_records SET revision=revision+1 WHERE owner='live:ea' AND kind='source' AND id=?",
        )
        .run(s);
    }
  };
  expect(await commit(f, p), 409);
  assert.ok(injected);
  assert.equal(count(f, "listing"), 0);
  assert.equal(value(f, "import", p.id).phase, "preview");
});
test("22 listing revision race prevents stale replacement and partial new rows", async (f) => {
  actors(f);
  const s = await source(f),
    base = item(),
    first = await preview(f, s, [base]);
  expect(await commit(f, first), 200);
  const id = first.rows[0].id,
    p = await preview(f, s, [
      { ...base, title: "Stale replacement title" },
      item({ externalId: "two", url: "https://jobs.example.org/two" }),
    ]);
  let injected = false;
  f.beforeRun = (sql) => {
    if (!injected && sql.startsWith("UPDATE career_records SET data=")) {
      injected = true;
      f.sqlite
        .prepare(
          "UPDATE career_records SET revision=revision+1,data=json_set(data,'$.review','accepted') WHERE owner='live:ea' AND kind='listing' AND id=?",
        )
        .run(id);
    }
  };
  expect(await commit(f, p), 409);
  assert.equal(count(f, "listing"), 1);
  assert.equal(value(f, "listing", id).title, base.title);
  assert.equal(value(f, "listing", id).review, "accepted");
  assert.equal(value(f, "import", p.id).phase, "preview");
});
test("23 database failure rolls back import phase and every listing write", async (f) => {
  actors(f);
  const s = await source(f),
    p = await preview(f, s, [
      item(),
      item({ externalId: "two", url: "https://jobs.example.org/two" }),
    ]);
  let writes = 0;
  f.beforeRun = (sql) => {
    if (
      sql.startsWith(
        "INSERT INTO career_records(owner,kind,id,candidate_id,employer_id,data,revision,created_at) SELECT",
      ) &&
      ++writes === 2
    )
      throw Error("Injected second listing failure");
  };
  expect(await commit(f, p), 500);
  assert.equal(writes, 2);
  assert.equal(count(f, "listing"), 0);
  assert.equal(value(f, "import", p.id).phase, "preview");
  f.beforeRun = null;
  expect(await commit(f, p), 200);
  assert.equal(count(f, "listing"), 2);
});
test("24 expired preview, paused source and invalid source revision reject safely", async (f) => {
  actors(f);
  const s = await source(f),
    p = await preview(f, s);
  f.sqlite
    .prepare(
      "UPDATE career_records SET data=json_set(data,'$.expiresAt',?) WHERE owner='live:ea' AND kind='import' AND id=?",
    )
    .run(new Date(Date.now() - 1000).toISOString(), p.id);
  expect(await commit(f, p), 409);
  expect(
    await f.request("ea", "imports/preview", {
      method: "POST",
      body: { sourceId: s, sourceRevision: 9, items: [item()] },
    }),
    409,
  );
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  expect(
    await f.request("ea", "sources/" + s, {
      method: "PATCH",
      body: { revision: 0, active: false },
    }),
    200,
  );
  expect(
    await f.request("ea", "imports/preview", {
      method: "POST",
      body: { sourceId: s, sourceRevision: 1, items: [item()] },
    }),
    409,
  );
  assert.equal(count(f, "listing"), 0);
});
test("25 retired plan creation returns 404 for both roles in live and demo", async (f) => {
  actors(f);
  const id = await offer(f);
  for (const demo of [false, true])
    for (const actor of ["ea", "ca"]) {
      expect(await f.request(actor, "plans", { method: "POST", body: planBody(id), demo }), 404);
      expect(await f.request(actor, "plans", { demo }), 404);
    }
  assert.equal(count(f, "plan"), 0);
});
test("26 retired plan mutation returns 404 without changing historic records or qualification", async (f) => {
  actors(f);
  const id = await legacyPlan(f);
  const before = row(f, "plan", id);
  const qualification = f.readCandidate(f.ca).qualification;
  for (const actor of ["ea", "ca", "eb", "cb"])
    for (const action of ["submit", "confirm", "reopen"])
      expect(await f.request(actor, "plans/" + id, {
        method: "PATCH",
        body: { revision: 0, stepId: "day-30", action, note: "Attempt to modify a retired feature" },
      }), 404);
  assert.deepEqual(row(f, "plan", id), before);
  assert.deepEqual(f.readCandidate(f.ca).qualification, qualification);
});
test("27 historic plans and all plan task statuses stay hidden from every actor", async (f) => {
  actors(f);
  const id = await legacyPlan(f);
  for (const actor of ["ea", "ca", "eb", "cb"]) {
    const current = await state(f, actor);
    assert.deepEqual(current.plans, []);
    assert.ok(current.tasks.every((task) => task.kind !== "plan"));
    assert.ok(!JSON.stringify(current).includes("LEGACY_PLAN_DO_NOT_EXPOSE"));
  }
  assert.equal(count(f, "plan"), 1);
  assert.ok(row(f, "plan", id));
});
test("28 retired plan tasks cannot be acknowledged or resurrected", async (f) => {
  actors(f);
  const id = await legacyPlan(f);
  const before = row(f, "plan", id);
  for (const actor of ["ea", "ca"])
    for (const done of [false, true])
      expect(await f.request(actor, "tasks", {
        method: "POST",
        body: { taskId: "plan:" + id + ":day-30:0", done },
      }), 404);
  assert.equal(count(f, "done", "ea"), 0);
  assert.equal(count(f, "done", "ca"), 0);
  assert.deepEqual(row(f, "plan", id), before);
});
test("29 neither calendar API nor direct calendar serializer exports retired plan tasks", async (f) => {
  actors(f);
  await legacyPlan(f);
  for (const actor of ["ea", "ca"]) {
    const result = await f.request(actor, "calendar");
    expect(result, 200);
    assert.ok(!result.value.includes("BEGIN:VEVENT"));
    assert.ok(!result.value.includes("LEGACY_PLAN_DO_NOT_EXPOSE"));
  }
  const retiredTask = {
    id: "legacy-plan-task", kind: "plan", title: "SECRET_LEGACY",
    detail: "Retired feature", dueAt: now(), targetId: "old", done: false,
  };
  const content = api.signalsDomain.calendar([retiredTask], now());
  assert.ok(!content.includes("BEGIN:VEVENT"));
  assert.ok(!content.includes("SECRET_LEGACY"));
});
test("30 calendar folds Unicode by bytes and escapes request titles through actual route", async (f) => {
  actors(f);
  await verification(f, "Задача, этап; " + "Разработка интерфейса 🎯 ".repeat(3) + "\nПродолжение");
  const r = await f.request("ca", "calendar");
  expect(r, 200);
  assert.equal(r.headers.get("content-type"), "text/calendar; charset=utf-8");
  const lines = r.value.split("\r\n");
  assert.ok(lines.every((x) => Buffer.byteLength(x, "utf8") <= 75));
  assert.ok(r.value.endsWith("\r\n"));
  assert.equal(lines.filter((x) => x === "BEGIN:VEVENT").length, 1);
  const unfolded = r.value.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("Задача\\, этап\\;"));
  assert.ok(unfolded.includes("\\nПродолжение"));
  assert.ok(!r.value.includes("\uFFFD"));
});
test("31 calendar neutralizes standalone CR property injection from a request title", async (f) => {
  actors(f);
  await verification(f, "Legitimate request\rBEGIN:VEVENT\rSUMMARY:Injected event");
  const r = await f.request("ca", "calendar");
  expect(r, 200);
  assert.ok(
    !r.value.replaceAll("\r\n", "").includes("\r"),
    "Calendar contains unescaped standalone CR in user-controlled SUMMARY",
  );
  assert.equal(r.value.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
});
test("32 dialogue task completion stays per actor and removes only personal export entries", async (f) => {
  actors(f);
  const id = await dialogue(f);
  const t = (await state(f, "ca")).tasks.find((task) => task.kind === "dialogue" && task.targetId === id);
  assert.ok(t);
  expect(await f.request("cb", "tasks", { method: "POST", body: { taskId: t.id, done: true } }), 404);
  expect(await f.request("ca", "tasks", { method: "POST", body: { taskId: "invented-task", done: true } }), 404);
  expect(await f.request("ca", "tasks", { method: "POST", body: { taskId: t.id, done: true } }), 200);
  assert.equal((await state(f, "ca")).tasks.find((task) => task.id === t.id).done, true);
  assert.equal((await state(f, "ea")).tasks.find((task) => task.id === t.id).done, false);
  const candidateCalendar = await f.request("ca", "calendar");
  const employerCalendar = await f.request("ea", "calendar");
  expect(candidateCalendar, 200);
  expect(employerCalendar, 200);
  assert.ok(!candidateCalendar.value.includes("BEGIN:VEVENT"));
  assert.equal(employerCalendar.value.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
});

test("33 competing previews cannot commit the same canonical URL under different IDs or sources", async () => {
  for (const distinctSource of [false, true]) {
    const g = actors(fixture());
    try {
      const sa = await source(g),
        sb = distinctSource ? await source(g) : sa;
      const a = await preview(g, sa, [
        item({
          externalId: "key-a",
          url: "https://jobs.example.org/shared/?b=2&a=1&utm_campaign=first#one",
        }),
      ]);
      const b = await preview(g, sb, [
        item({
          externalId: "key-b",
          url: "https://jobs.example.org/shared?a=1&b=2&utm_source=second#two",
        }),
        item({
          externalId: "loser-only",
          url: "https://jobs.example.org/loser-only",
        }),
      ]);
      assert.equal(a.rows[0].status, "new");
      assert.equal(b.rows[0].status, "new");
      expect(await commit(g, a), 200);
      expect(await commit(g, b), 409);
      assert.equal(
        count(g, "listing"),
        1,
        "losing batch must not insert its unrelated row",
      );
      assert.equal(value(g, "import", b.id).phase, "preview");
      assert.equal(row(g, "listing", b.rows[1].id), undefined);
      const retry = await preview(g, sb, [
        item({
          externalId: "key-b",
          url: "https://jobs.example.org/shared?b=2&a=1",
        }),
      ]);
      assert.equal(retry.rows[0].status, "duplicate");
    } finally {
      g.sqlite.close();
    }
  }
});
test("34 parallel cross-source commits elect one canonical-URL winner with no partial losing batch", async (f) => {
  actors(f);
  const sa = await source(f),
    sb = await source(f),
    url = "https://jobs.example.org/contested";
  const a = await preview(f, sa, [
    item({ externalId: "a", url: url + "?utm_source=a" }),
    item({ externalId: "a-only", url: "https://jobs.example.org/a-only" }),
  ]);
  const b = await preview(f, sb, [
    item({ externalId: "b", url: url + "/#tail" }),
    item({ externalId: "b-only", url: "https://jobs.example.org/b-only" }),
  ]);
  const responses = await Promise.all([commit(f, a), commit(f, b)]);
  assert.deepEqual(
    responses.map((x) => x.status).sort((a, b) => a - b),
    [200, 409],
  );
  const winner = responses[0].status === 200 ? a : b,
    loser = winner === a ? b : a;
  assert.equal(count(f, "listing"), 2);
  assert.equal(value(f, "import", winner.id).phase, "committed");
  assert.equal(value(f, "import", loser.id).phase, "preview");
  assert.ok(row(f, "listing", winner.rows[1].id));
  assert.equal(row(f, "listing", loser.rows[1].id), undefined);
  assert.equal(
    (await state(f)).listings.filter((x) => x.url === url).length,
    1,
  );
});
test("35 canonical URL dedup is tenant-scoped and does not suppress another employer copy", async (f) => {
  actors(f);
  const sa = await source(f),
    sb = await source(f, "eb"),
    url = "https://jobs.example.org/shared-across-tenants";
  const a = await preview(f, sa, [item({ url })]),
    b = await preview(f, sb, [item({ url })], "eb");
  expect(await commit(f, a), 200);
  expect(await commit(f, b, "eb"), 200);
  assert.equal(count(f, "listing"), 1);
  assert.equal(count(f, "listing", "eb"), 1);
  assert.ok(!(await state(f)).listings.some((x) => x.id === b.rows[0].id));
});
test("36 canonical collision inserted at the SQL boundary rejects every row of stale commit", async (f) => {
  actors(f);
  const sa = await source(f),
    sb = await source(f),
    url = "https://jobs.example.org/race-at-sql";
  const a = await preview(f, sa, [item({ externalId: "winner", url })]),
    b = await preview(f, sb, [
      item({ externalId: "loser", url }),
      item({
        externalId: "unrelated",
        url: "https://jobs.example.org/unrelated",
      }),
    ]);
  const winnerLine = a.rows[0];
  let injected = false;
  f.beforeRun = (sql) => {
    if (!injected && sql.startsWith("UPDATE career_records SET data=")) {
      injected = true;
      const at = now(),
        data = {
          ...winnerLine.item,
          sourceId: sa,
          fingerprint: winnerLine.fingerprint,
          review: "pending",
          firstSeenAt: at,
          lastSeenAt: at,
          history: [],
        };
      f.sqlite
        .prepare(
          "INSERT INTO career_records(owner,kind,id,candidate_id,employer_id,data,revision,created_at) VALUES(?,'listing',?,'',?,?,0,?)",
        )
        .run("live:ea", winnerLine.id, "live:ea", JSON.stringify(data), at);
    }
  };
  expect(await commit(f, b), 409);
  f.beforeRun = null;
  assert.ok(injected);
  assert.equal(count(f, "listing"), 1);
  assert.equal(value(f, "import", b.id).phase, "preview");
  assert.equal(row(f, "listing", b.rows[1].id), undefined);
});
test("37 a personal request mark survives an adjacent request and never completes the source", async (f) => {
  actors(f);
  const first = await verification(f);
  const taskId = "request:" + first;
  expect(await f.request("ca", "tasks", { method: "POST", body: { taskId, done: true } }), 200);
  await verification(f, "Проверка доступности интерфейсов");
  const current = await state(f, "ca");
  assert.equal(current.tasks.find((task) => task.id === taskId).done, true);
  assert.equal(current.tasks.filter((task) => !task.done).length, 1);
  assert.equal(value(f, "request", first).state, "requested");
  const calendar = await f.request("ca", "calendar");
  expect(calendar, 200);
  assert.equal(calendar.value.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
});
test("38 dialogue acknowledgement survives messages while a new shared step needs fresh acknowledgement", async (f) => {
  actors(f);
  const id = await dialogue(f);
  const find = async () => (await state(f)).tasks.find((task) => task.kind === "dialogue" && task.targetId === id);
  const task = await find();
  assert.ok(task);
  expect(await f.request("ea", "tasks", { method: "POST", body: { taskId: task.id, done: true } }), 200);
  await nextStep(f, id, "message");
  assert.equal((await find()).id, task.id);
  assert.equal((await find()).done, true);
  await nextStep(f, id);
  const next = await find();
  assert.notEqual(next.id, task.id);
  assert.equal(next.done, false);
  assert.equal((await state(f, "ca")).tasks.find((item) => item.id === next.id).done, false);
});

test("39 catalogue cap is checked atomically across concurrent previews; refresh still works at cap", async (f) => {
  actors(f);
  const s = await source(f),
    base = item(),
    first = await preview(f, s, [base]);
  expect(await commit(f, first), 200);
  const at = now(),
    seed = f.sqlite.prepare(
      "INSERT INTO career_records(owner,kind,id,candidate_id,employer_id,data,revision,created_at) VALUES(?,'listing',?,'',?,?,0,?)",
    );
  for (let i = 0; i < 498; i++) {
    const data = {
      ...item({
        externalId: "seed-" + i,
        url: "https://jobs.example.org/seed-" + i,
      }),
      sourceId: s,
      fingerprint: "fixture-" + i,
      review: "pending",
      firstSeenAt: at,
      lastSeenAt: at,
      history: [],
    };
    seed.run("live:ea", "fixture-" + i, "live:ea", JSON.stringify(data), at);
  }
  assert.equal(count(f, "listing"), 499);
  const a = await preview(f, s, [
      item({ externalId: "last-a", url: "https://jobs.example.org/last-a" }),
    ]),
    b = await preview(f, s, [
      item({ externalId: "last-b", url: "https://jobs.example.org/last-b" }),
    ]);
  const outcomes = await Promise.all([commit(f, a), commit(f, b)]);
  assert.deepEqual(
    outcomes.map((x) => x.status).sort((a, b) => a - b),
    [200, 409],
  );
  assert.equal(count(f, "listing"), 500);
  const loser = outcomes[0].status === 409 ? a : b;
  assert.equal(value(f, "import", loser.id).phase, "preview");
  assert.equal(row(f, "listing", loser.rows[0].id), undefined);
  const refresh = await preview(f, s, [base]);
  assert.equal(refresh.rows[0].status, "unchanged");
  expect(await commit(f, refresh), 200);
  assert.equal(count(f, "listing"), 500);
  expect(
    await f.request("ea", "imports/preview", {
      method: "POST",
      body: {
        sourceId: s,
        sourceRevision: 0,
        items: [
          item({
            externalId: "too-many",
            url: "https://jobs.example.org/too-many",
          }),
        ],
      },
    }),
    422,
  );
});

const results = [];
const start = Date.now();
for (const { name, fn } of tests) {
  const f = fixture();
  try {
    await fn(f);
    results.push({ name, pass: true });
    console.log("PASS " + name);
  } catch (error) {
    results.push({ name, pass: false, error: error.stack ?? String(error) });
    console.error("FAIL " + name + "\n" + (error.stack ?? error));
  } finally {
    f.sqlite.close();
  }
}
globalThis.fetch = originalFetch;
const summary = {
  project,
  createdAt: now(),
  durationMs: Date.now() - start,
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  total: results.length,
  results,
};
if (process.env.PROFECTIUM_TEST_REPORT)
  fs.writeFileSync(
    process.env.PROFECTIUM_TEST_REPORT,
    JSON.stringify(summary, null, 2),
  );
console.log(
  JSON.stringify({
    passed: summary.passed,
    failed: summary.failed,
    total: summary.total,
    durationMs: summary.durationMs,
  }),
);
process.exitCode = summary.failed ? 1 : 0;
