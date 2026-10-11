/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

/**
 * Additional v3 feature invariants. Run: node feature-invariants.mjs <platform-dir>
 * Actual routes + migrations; esbuild write:false; SQLite :memory:; no network.
 * Sibling profile-form-state.mjs runs the actual ProfileForm with a hook-unit harness.
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
  export * as engine from './lib/server/assessment-engine';
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
          path: path.join(project, x.path.slice(2) + ".ts"),
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
  throw new Error("Outbound network disabled in feature invariant suite");
};
const ORIGIN = "https://feature-review.invalid",
  LIVE = "live-profectium-v1";
const roles = [
  "Frontend",
  "Backend",
  "Fullstack",
  "Data Science",
  "DevOps",
  "QA",
];
const grades = ["Junior", "Middle", "Senior"];
const status = (response, want) =>
  assert.equal(
    response.status,
    want,
    `HTTP status should be ${want}, got ${response.status}`,
  );
const now = () => new Date().toISOString();

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs
    .readdirSync(path.join(project, "drizzle"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(fs.readFileSync(path.join(project, "drizzle", file), "utf8"));
  const f = { sqlite, beforeRun: null };
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
    { method = "GET", body, headers = {}, demo = false } = {},
  ) =>
    contexts.run(
      { fixture: f, user: { userId: id, email: id + "@example.invalid" } },
      async () => {
        const owner = demo ? id : "live:" + id;
        const account = sqlite
          .prepare(
            `SELECT revision FROM ${demo ? "demo_accounts" : "members"} WHERE owner=?`,
          )
          .get(owner);
        const req = new Request(
          ORIGIN + (demo ? "/api/v1/" : "/api/live/v1/") + route,
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
        const response = await api.route[method](req, {
          params: Promise.resolve({ path: route.split("/") }),
        });
        return { status: response.status, value: await response.json() };
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
      sqlite
        .prepare("INSERT INTO companies(owner,data) VALUES(?,?)")
        .run(
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
const profile = (c) =>
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
const notesInput = (
  stage = "shortlist",
  text = "Candidate context",
  revision = 0,
) => ({ stage, text, revision });
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let v3Combinations = 0,
  legacyCombinations = 0,
  uiChecks = 0;

test("Persisted notes preserve stage/text and stay private to their employer", async (f) => {
  f.member("ea", "employer");
  f.member("eb", "employer");
  const id = f.member("ca", "candidate", true);
  status(
    await f.request("ea", "notes/" + id, {
      method: "PUT",
      body: notesInput("shortlist", "Private note A"),
    }),
    200,
  );
  status(
    await f.request("eb", "notes/" + id, {
      method: "PUT",
      body: notesInput("interview", "Private note B"),
    }),
    200,
  );
  const a = (await f.request("ea", "state")).value,
    b = (await f.request("eb", "state")).value,
    c = (await f.request("ca", "state")).value;
  assert.deepEqual(
    a.notes.map((n) => [n.candidateId, n.stage, n.text, n.revision]),
    [[id, "shortlist", "Private note A", 1]],
  );
  assert.deepEqual(
    b.notes.map((n) => [n.candidateId, n.stage, n.text, n.revision]),
    [[id, "interview", "Private note B", 1]],
  );
  assert.deepEqual(c.notes, []);
  const rows = f.sqlite
    .prepare(
      "SELECT owner,data FROM hiring_notes WHERE candidate_id=? ORDER BY owner",
    )
    .all(id);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].owner, rows[1].owner);
});
test("Note CAS rejects stale updates without changing persisted text or stage", async (f) => {
  f.member("ea", "employer");
  const id = f.member("ca", "candidate", true);
  status(
    await f.request("ea", "notes/" + id, { method: "PUT", body: notesInput() }),
    200,
  );
  status(
    await f.request("ea", "notes/" + id, {
      method: "PUT",
      body: notesInput("screening", "Second saved version", 1),
    }),
    200,
  );
  status(
    await f.request("ea", "notes/" + id, {
      method: "PUT",
      body: notesInput("decision", "Stale overwrite", 1),
    }),
    409,
  );
  const row = f.sqlite
    .prepare(
      "SELECT data,revision FROM hiring_notes WHERE owner=? AND candidate_id=?",
    )
    .get("live:ea", id);
  assert.equal(row.revision, 2);
  assert.equal(JSON.parse(row.data).stage, "screening");
  assert.equal(JSON.parse(row.data).text, "Second saved version");
});
test("Concurrent note creation and updates each have a single winner", async (f) => {
  f.member("ea", "employer");
  const id = f.member("ca", "candidate", true);
  const create = await Promise.all(
    ["first", "second"].map((text) =>
      f.request("ea", "notes/" + id, {
        method: "PUT",
        body: notesInput("shortlist", text, 0),
      }),
    ),
  );
  assert.deepEqual(create.map((r) => r.status).sort(), [200, 409]);
  const update = await Promise.all(
    ["screening", "interview"].map((stage) =>
      f.request("ea", "notes/" + id, {
        method: "PUT",
        body: notesInput(stage, "Concurrent update", 1),
      }),
    ),
  );
  assert.deepEqual(update.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    f.sqlite
      .prepare(
        "SELECT revision FROM hiring_notes WHERE owner=? AND candidate_id=?",
      )
      .get("live:ea", id).revision,
    2,
  );
});
test("Copying another employer note revision cannot overwrite or create that employer note", async (f) => {
  f.member("ea", "employer");
  f.member("eb", "employer");
  const id = f.member("ca", "candidate", true);
  status(
    await f.request("ea", "notes/" + id, {
      method: "PUT",
      body: notesInput("decision", "Only employer A"),
    }),
    200,
  );
  status(
    await f.request("eb", "notes/" + id, {
      method: "PUT",
      body: notesInput("screening", "Attempt using A revision", 1),
    }),
    409,
  );
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM hiring_notes").get().n,
    1,
  );
  assert.equal(
    JSON.parse(f.sqlite.prepare("SELECT data FROM hiring_notes").get().data)
      .text,
    "Only employer A",
  );
});
test("Note stage, role, owner injection and unavailable target are validated", async (f) => {
  f.member("ea", "employer");
  const id = f.member("ca", "candidate", true),
    hidden = f.member("hidden", "candidate", false);
  status(
    await f.request("ea", "notes/" + id, {
      method: "PUT",
      body: notesInput("hired"),
    }),
    422,
  );
  status(
    await f.request("ea", "notes/" + id, {
      method: "PUT",
      body: { ...notesInput(), owner: "live:another" },
    }),
    422,
  );
  status(
    await f.request("ca", "notes/" + id, { method: "PUT", body: notesInput() }),
    403,
  );
  status(
    await f.request("ea", "notes/" + hidden, {
      method: "PUT",
      body: notesInput(),
    }),
    404,
  );
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM hiring_notes").get().n,
    0,
  );
});
test("Note write checks employer membership revision in the SQL statement", async (f) => {
  f.member("ea", "employer");
  const id = f.member("ca", "candidate", true);
  let fired = false;
  f.beforeRun = (sql) => {
    if (!fired && /^INSERT INTO hiring_notes/.test(sql)) {
      fired = true;
      f.sqlite
        .prepare("UPDATE members SET revision=revision+1 WHERE owner=?")
        .run("live:ea");
    }
  };
  status(
    await f.request("ea", "notes/" + id, { method: "PUT", body: notesInput() }),
    409,
  );
  assert.ok(fired);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM hiring_notes").get().n,
    0,
  );
});
test("Learning updates only own progress and preserves qualification, evidence and assessment history", async (f) => {
  const a = f.member("ca", "candidate", true),
    b = f.member("cb", "candidate", true),
    before = f.readCandidate(a);
  const completed = [
    "frontend-js",
    "frontend-browser",
    "$.qualification.grade",
  ];
  const r = await f.request("ca", "learning", {
    method: "PATCH",
    body: { completed },
  });
  status(r, 200);
  const after = f.readCandidate(a);
  assert.deepEqual(after.learningCompleted, completed);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.qualification, before.qualification);
  assert.deepEqual(after.achievements, before.achievements);
  assert.equal(after.role, before.role);
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  assert.equal(after.grade, before.grade);
  assert.equal(f.readCandidate(b).learningCompleted, undefined);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM assessments").get().n,
    0,
  );
});
test("Learning cannot create a qualification or accept a forged qualification field", async (f) => {
  const id = f.member("ca", "candidate", false);
  status(
    await f.request("ca", "learning", {
      method: "PATCH",
      body: { completed: ["completed-everything"] },
    }),
    200,
  );
  assert.equal(f.readCandidate(id).qualification, undefined);
  status(
    await f.request("ca", "learning", {
      method: "PATCH",
      body: {
        completed: [],
        qualification: { role: "Backend", grade: "Senior", score: 100 },
      },
    }),
    422,
  );
  assert.equal(f.readCandidate(id).qualification, undefined);
});
test("Learning progress respects processing consent and candidate-only access", async (f) => {
  const id = f.member("ca", "candidate", true);
  f.member("ea", "employer");
  f.sqlite
    .prepare(
      "UPDATE candidates SET data=json_set(data,'$.privacy.processing',json('false')) WHERE owner=? AND id=?",
    )
    .run(LIVE, id);
  status(
    await f.request("ca", "learning", {
      method: "PATCH",
      body: { completed: ["x"] },
    }),
    403,
  );
  status(
    await f.request("ea", "learning", {
      method: "PATCH",
      body: { completed: ["x"] },
    }),
    403,
  );
  assert.equal(f.readCandidate(id).learningCompleted, undefined);
});
test("Concurrent profile change prevents a stale learning write", async (f) => {
  const id = f.member("ca", "candidate", true);
  let fired = false;
  f.beforeRun = (sql) => {
    if (!fired && sql.includes("$.learningCompleted")) {
      fired = true;
      f.sqlite
        .prepare(
          "UPDATE candidates SET data=json_set(data,'$.bio',?),revision=revision+1 WHERE owner=? AND id=?",
        )
        .run("Concurrent profile update remains authoritative.", LIVE, id);
    }
  };
  status(
    await f.request("ca", "learning", {
      method: "PATCH",
      body: { completed: ["x"] },
    }),
    409,
  );
  assert.ok(fired);
  const after = f.readCandidate(id);
  assert.equal(after.learningCompleted, undefined);
  assert.equal(after.bio, "Concurrent profile update remains authoritative.");
});
test("Profile stale before sync remains stale afterwards and cannot re-enable publication", async (f) => {
  const demoOwner = "demo-owner";
  const init = await f.request(demoOwner, "state", { demo: true });
  status(init, 200);
  const id = init.value.demoPersonas[0].id;
  status(
    await f.request(demoOwner, "session", {
      demo: true,
      method: "POST",
      body: { role: "candidate", candidateId: id },
    }),
    200,
  );
  const original = (await f.request(demoOwner, "state", { demo: true })).value
      .candidates[0],
    draft = profile(original);
  const changed = profile(original);
  changed.privacy.publication = false;
  status(
    await f.request(demoOwner, "profile", {
      demo: true,
      method: "PATCH",
      body: changed,
      headers: { "If-Match": String(original.revision) },
    }),
    200,
  );
  const synced = await f.request(demoOwner, "profile/sync", {
    demo: true,
    method: "POST",
    body: {},
  });
  status(synced, 200);
  assert.equal(synced.value.candidates[0].revision, original.revision + 2);
  status(
    await f.request(demoOwner, "profile", {
      demo: true,
      method: "PATCH",
      body: draft,
      headers: { "If-Match": String(original.revision) },
    }),
    409,
  );
  const current = (await f.request(demoOwner, "state", { demo: true })).value
    .candidates[0];
  assert.equal(current.privacy.publication, false);
  assert.equal(current.revision, original.revision + 2);
});

function answersFor(assessment, keys, mask) {
  const answers = {};
  let total = 0,
    professional = 0;
  assessment.questions.forEach((q, index) => {
    const correct = Boolean(mask & (1 << index));
    if (correct) {
      total++;
      if (q.kind === "professional") professional++;
    }
    answers[q.id] = correct
      ? keys[q.id]
      : q.options.find((o) => o.id !== keys[q.id]).id;
  });
  return { answers, total, professional };
}
function legacyAttempt(role = "Frontend", grade = "Junior") {
  const { assessment, keys } = api.engine.createAssessment(
    role,
    grade,
    "ИТ",
    "Legacy rubric compatibility",
  );
  assessment.blueprint = "fsp-pilot-2";
  delete assessment.rubric;
  // Persisted v2 contract had exactly two professional and four general questions.
  assessment.questions.forEach((q, i) => {
    q.kind = i < 2 ? "professional" : "general";
  });
  return { assessment, keys };
}
for (const role of roles)
  for (const grade of grades) {
    test(`V3 persisted scoring: all 64 answer subsets / ${role} ${grade}`, async (f) => {
      const { assessment: template, keys } = api.engine.createAssessment(
        role,
        grade,
        "ИТ",
        "Exhaustive persisted scoring",
      );
      assert.equal(template.questions.length, 6);
      assert.equal(
        template.questions.filter((q) => q.kind === "professional").length,
        4,
      );
      assert.equal(
        template.questions.filter((q) => q.kind === "general").length,
        2,
      );
      assert.equal(template.rubric.minimumTotal, 4);
      assert.equal(template.rubric.minimumProfessional, 3);
      assert.equal(template.rubric.bankVersion, template.blueprint);
      assert.equal(template.blueprint, "profectium-pilot-3");
      let passed = 0;
      for (let mask = 0; mask < 64; mask++) {
        const actor = "subset-" + mask,
          id = f.member(actor),
          assessment = {
            ...structuredClone(template),
            id: crypto.randomUUID(),
          };
        const { answers, total, professional } = answersFor(
          assessment,
          keys,
          mask,
        );
        const expected = total >= 4 && professional >= 3 ? "passed" : "failed";
        const sourceSnapshot = JSON.stringify(assessment);
        const unit = api.engine.scoreAssessment(assessment, keys, answers);
        assert.equal(unit.status, expected, `Scoring mask ${mask}`);
        assert.equal(
          JSON.stringify(assessment),
          sourceSnapshot,
          "Scorer mutated its source attempt",
        );
        f.insertAttempt(id, assessment, keys);
        const response = await f.request(
          actor,
          "assessments/" + assessment.id,
          { method: "POST", body: { answers } },
        );
        status(response, 200);
        const row = f.sqlite
            .prepare(
              "SELECT status,data,answer_key FROM assessments WHERE id=?",
            )
            .get(assessment.id),
          saved = JSON.parse(row.data);
        assert.equal(row.status, expected, `Persisted scoring mask ${mask}`);
        assert.equal(saved.score, Math.round((total / 6) * 100));
        assert.equal(saved.feedback.filter((x) => x.correct).length, total);
        assert.deepEqual(saved.rubric, template.rubric);
        assert.deepEqual(JSON.parse(row.answer_key), keys);
        const qualification = f.readCandidate(id).qualification;
        if (expected === "passed") {
          passed++;
          assert.equal(qualification.attemptId, assessment.id);
          assert.equal(qualification.role, role);
          assert.equal(qualification.grade, grade);
          assert.equal(qualification.score, saved.score);
        } else
          assert.equal(
            qualification,
            undefined,
            `Failed mask ${mask} assigned a qualification`,
          );
        v3Combinations++;
      }
      assert.equal(
        passed,
        16,
        "Exactly 16 of 64 subsets satisfy four total and three professional",
      );
    });
    test(`V2 saved rubric fallback: all 64 subsets / ${role} ${grade}`, async () => {
      const { assessment, keys } = legacyAttempt(role, grade);
      let passed = 0;
      for (let mask = 0; mask < 64; mask++) {
        const { answers, total, professional } = answersFor(
            assessment,
            keys,
            mask,
          ),
          expected = total >= 4 && professional === 2 ? "passed" : "failed";
        const result = api.engine.scoreAssessment(assessment, keys, answers);
        assert.equal(result.status, expected, `Legacy scoring mask ${mask}`);
        assert.equal(result.score, Math.round((total / 6) * 100));
        assert.equal(result.blueprint, "fsp-pilot-2");
        assert.equal(result.rubric, undefined);
        if (expected === "passed") passed++;
        legacyCombinations++;
      }
      assert.equal(
        passed,
        11,
        "Legacy requires both professional plus at least two general answers",
      );
    });
  }
test("A persisted V2 attempt passes with two professional answers and remains immutable on replay", async (f) => {
  const id = f.member("legacy");
  const { assessment, keys } = legacyAttempt();
  f.insertAttempt(id, assessment, keys);
  const { answers } = answersFor(assessment, keys, 0b001111); // two professional + two general
  const first = await f.request("legacy", "assessments/" + assessment.id, {
    method: "POST",
    body: { answers },
  });
  status(first, 200);
  assert.equal(first.value.assessments[0].status, "passed");
  assert.equal(first.value.assessments[0].blueprint, "fsp-pilot-2");
  assert.ok(!first.value.assessments[0].resultNonce);
  const saved = f.sqlite
      .prepare("SELECT data,answer_key,status FROM assessments WHERE id=?")
      .get(assessment.id),
    revision = f.readCandidate(id).revision;
  assert.equal(f.readCandidate(id).qualification.attemptId, assessment.id);
  status(
    await f.request("legacy", "assessments/" + assessment.id, {
      method: "POST",
      body: { answers },
    }),
    200,
  );
  status(
    await f.request("legacy", "assessments/" + assessment.id, {
      method: "POST",
      body: { answers: answersFor(assessment, keys, 63).answers },
    }),
    409,
  );
  assert.deepEqual(
    f.sqlite
      .prepare("SELECT data,answer_key,status FROM assessments WHERE id=?")
      .get(assessment.id),
    saved,
  );
  assert.equal(f.readCandidate(id).revision, revision);
});
test("Persisted custom rubric is authoritative even when current defaults would pass", async (f) => {
  const id = f.member("custom");
  const { assessment, keys } = api.engine.createAssessment(
    "Backend",
    "Middle",
    "ИТ",
    "Saved rules are authoritative",
  );
  assessment.rubric = {
    minimumTotal: 6,
    minimumProfessional: 4,
    bankVersion: "saved-stricter-rubric",
  };
  f.insertAttempt(id, assessment, keys);
  const wrongGeneral = assessment.questions.findIndex(
      (q) => q.kind === "general",
    ),
    mask = 63 & ~(1 << wrongGeneral),
    { answers } = answersFor(assessment, keys, mask);
  const result = await f.request("custom", "assessments/" + assessment.id, {
    method: "POST",
    body: { answers },
  });
  status(result, 200);
  assert.equal(result.value.assessments[0].status, "failed");
  assert.equal(f.readCandidate(id).qualification, undefined);
  assert.deepEqual(result.value.assessments[0].rubric, assessment.rubric);
});
test("Expired V2 and V3 attempts cannot pass with all correct answers", async () => {
  for (const legacy of [false, true]) {
    const { assessment, keys } = legacy
      ? legacyAttempt()
      : api.engine.createAssessment(
          "QA",
          "Senior",
          "ИТ",
          "Expired attempt check",
        );
    const result = api.engine.scoreAssessment(
      assessment,
      keys,
      keys,
      Date.parse(assessment.expiresAt) + 1,
    );
    assert.equal(result.status, "expired");
  }
});
test("ProfileForm keeps its draft base revision across sync and failed saves", async () => {
  const { runProfileFormChecks } = await import("./profile-form-state.mjs");
  const result = await runProfileFormChecks(project);
  assert.ok(result.passed >= 3);
  uiChecks = result.passed;
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
      console.error(
        "FAIL " + name + " :: " + String(e?.message ?? e).slice(0, 600),
      );
    } finally {
      f.sqlite.close();
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__featureReviewContext;
}
console.log(
  JSON.stringify({
    suite: "feature-invariants",
    tests: tests.length,
    passed: tests.length - failures,
    failed: failures,
    v3Combinations,
    legacyCombinations,
    uiChecks,
    network: false,
    database: "in-memory",
    checkoutWrites: false,
  }),
);
if (failures) process.exitCode = 1;
