/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const project = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(project, "package.json"));
const { build } = require("esbuild");
const plugins = [
  {
    name: "read-only-review",
    setup(b) {
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
        path: "db",
        namespace: "review",
      }));
      b.onResolve({ filter: /session-auth$/ }, () => ({
        path: "auth",
        namespace: "review",
      }));
      b.onLoad({ filter: /.*/, namespace: "review" }, (x) => ({
        contents:
          x.path === "db"
            ? "export const env={get DB(){return globalThis.__reviewDb}}"
            : "export async function getCurrentUser(){return {userId:'review-owner'}}",
        loader: "js",
      }));
      b.onResolve({ filter: /^@\// }, (x) => ({
        path: path.resolve(project, x.path.slice(2) + ".ts"),
      }));
    },
  },
];
const built = await build({
  absWorkingDir: project,
  entryPoints: ["app/api/v1/[...path]/route.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins,
  logLevel: "silent",
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs
    .readdirSync(path.join(project, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(fs.readFileSync(path.join(project, "drizzle", file), "utf8"));
  let revision = 0,
    firstHook = null,
    allHook = null;
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      const value = sqlite.prepare(this.sql).get(...this.args) ?? null;
      if (firstHook?.matches(this.sql, this.args)) {
        const hook = firstHook;
        firstHook = null;
        await hook.wait();
      }
      return value;
    }
    async all() {
      const results = sqlite.prepare(this.sql).all(...this.args);
      if (allHook?.matches(this.sql, this.args)) {
        const hook = allHook;
        allHook = null;
        await hook.wait();
      }
      return { results };
    }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { meta: { changes: Number(result.changes) } };
    }
  }
  globalThis.__reviewDb = {
    prepare: (sql) => new Statement(sql),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  async function request(route, body) {
    const method = body === undefined ? "GET" : "POST";
    const response = await api[method](
      new Request("https://review.local/api/v1/" + route, {
        method,
        headers: {
          Origin: "https://review.local",
          "Content-Type": "application/json",
          "X-Session-Revision": String(revision),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: Promise.resolve({ path: route.split("/") }) },
    );
    const value = await response.json();
    if (value.session) revision = value.session.revision;
    return { status: response.status, value };
  }
  function pause(kind, matches) {
    let enter, release;
    const entered = new Promise((r) => (enter = r)),
      released = new Promise((r) => (release = r));
    const hook = {
      matches,
      wait: async () => {
        enter();
        await released;
      },
    };
    if (kind === "first") firstHook = hook;
    else allHook = hook;
    return { entered, release };
  }
  const keys = (id) =>
    JSON.parse(
      sqlite.prepare("SELECT answer_key FROM assessments WHERE id=?").get(id)
        .answer_key,
    );
  async function init(onboard = true) {
    await request("state");
    if (onboard)
      await request("onboarding", {
        fullName: "Review Candidate",
        contact: "review@example.test",
        processing: true,
        publication: true,
      });
  }
  return { request, pause, keys, init, sqlite };
}
const assessmentInput = (grade) => ({
  role: "Backend",
  grade,
  industry: "ИТ",
  motivation: "Проверка конкурентного прохождения",
});
const candidateRead = (sql) =>
  sql === "SELECT data,revision FROM candidates WHERE owner=? AND id=?";
const historyRead = (sql) =>
  sql ===
  "SELECT data,status FROM assessments WHERE owner=? AND candidate_id=? ORDER BY created_at DESC";
const results = [];
{
  const f = fixture();
  await f.init();
  const startedA = await f.request("assessments", assessmentInput("Junior"));
  const attemptA = startedA.value.assessments.find(
    (a) => a.status === "active",
  );
  const gate = f.pause("first", candidateRead);
  const pendingB = f.request("assessments", assessmentInput("Senior"));
  await gate.entered;
  const doneA = await f.request("assessments/" + attemptA.id, {
    answers: f.keys(attemptA.id),
  });
  gate.release();
  const startedB = await pendingB;
  let secondQualification;
  if (startedB.status === 201) {
    const attemptB = startedB.value.assessments.find(
      (a) => a.status === "active",
    );
    const doneB = await f.request("assessments/" + attemptB.id, {
      answers: f.keys(attemptB.id),
    });
    secondQualification = doneB.value.candidates?.[0]?.qualification;
  }
  results.push({
    case: "cooldown: completion between candidate and history reads",
    expectedStartStatus: 409,
    actualStartStatus: startedB.status,
    passed: startedB.status === 409,
    firstQualification: doneA.value.candidates[0].qualification,
    secondQualification,
  });
  f.sqlite.close();
}
{
  const f = fixture();
  await f.init();
  const gate = f.pause("all", historyRead);
  const pendingB = f.request("assessments", assessmentInput("Junior"));
  await gate.entered;
  const startedA = await f.request("assessments", assessmentInput("Junior"));
  const attemptA = startedA.value.assessments.find(
      (a) => a.status === "active",
    ),
    keys = f.keys(attemptA.id);
  const answers = Object.fromEntries(
    attemptA.questions.map((q) => [
      q.id,
      q.options.find((o) => o.id !== keys[q.id]).id,
    ]),
  );
  const doneA = await f.request("assessments/" + attemptA.id, { answers });
  gate.release();
  const startedB = await pendingB;
  results.push({
    case: "24h limit: failed attempt between history read and insertion",
    expectedStartStatus: 409,
    actualStartStatus: startedB.status,
    passed: startedB.status === 409,
    priorAttemptStatus: doneA.value.assessments.find(
      (a) => a.id === attemptA.id,
    ).status,
  });
  f.sqlite.close();
}
{
  const f = fixture();
  await f.init(false);
  const gate = f.pause("first", candidateRead);
  const pendingB = f.request("onboarding", {
    fullName: "Second Candidate",
    contact: "second@example.test",
    processing: true,
    publication: false,
  });
  await gate.entered;
  const createdA = await f.request("onboarding", {
    fullName: "First Candidate",
    contact: "first@example.test",
    processing: true,
    publication: true,
  });
  gate.release();
  const createdB = await pendingB;
  results.push({
    case: "onboarding: competing payload must not report creation success",
    firstStatus: createdA.status,
    expectedSecondStatus: 409,
    actualSecondStatus: createdB.status,
    passed: createdB.status === 409,
    savedName: createdB.value.candidates?.[0]?.fullName,
    savedPublication: createdB.value.candidates?.[0]?.privacy?.publication,
  });
  f.sqlite.close();
}
{
  const engineBuild = await build({
    absWorkingDir: project,
    entryPoints: ["lib/server/assessment-engine.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  const engine = await import(
    "data:text/javascript;base64," +
      Buffer.from(engineBuild.outputFiles[0].text).toString("base64")
  );
  const roles = [
      "Frontend",
      "Backend",
      "Fullstack",
      "Data Science",
      "DevOps",
      "QA",
    ],
    grades = ["Junior", "Middle", "Senior"];
  const generalTopics = new Set([
    "Расчёт нагрузки",
    "Проверка результата",
    "Надёжность",
    "Граничные условия",
  ]);
  const violations = [];
  for (const role of roles)
    for (const grade of grades) {
      const { assessment, keys } = engine.createAssessment(
        role,
        grade,
        "ИТ",
        "Проверка профессионального блока",
      );
      const professional = assessment.questions.filter(
        (q) => q.kind === "professional" || !generalTopics.has(q.topic),
      );
      if (professional.length !== 4) {
        violations.push({
          role,
          grade,
          error: "Expected four professional questions",
        });
        continue;
      }
      for (const professionalCorrect of [0, 1, 2, 3, 4]) {
        const answers = { ...keys };
        for (let i = professionalCorrect; i < professional.length; i++) {
          const question = professional[i];
          answers[question.id] = question.options.find(
            (o) => o.id !== keys[question.id],
          ).id;
        }
        const scored = engine.scoreAssessment(assessment, keys, answers);
        const expected = professionalCorrect >= 3 ? "passed" : "failed";
        if (scored.status !== expected)
          violations.push({
            role,
            grade,
            professionalCorrect,
            expected,
            actual: scored.status,
            score: scored.score,
          });
      }
    }
  results.push({
    case: "professional block is mandatory for all 18 combinations",
    checks: 90,
    passed: violations.length === 0,
    violations,
  });
}
console.log(
  JSON.stringify(
    {
      readOnly: true,
      notes:
        "Bundling uses write:false; databases are in memory; no project or plugin files are changed.",
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
