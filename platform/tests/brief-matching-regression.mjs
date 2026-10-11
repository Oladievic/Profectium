/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";

// Exercise production matching and validation with independent expectation cases.
// Everything is bundled in memory: no running server, database or network needed.
const project = path.resolve(process.argv[2] ?? process.cwd());
const result = await build({
  absWorkingDir: project,
  stdin: {
    resolveDir: project,
    contents: `
      export { matchBrief, compareBriefMatches, normalizeSkill, uniqueSkills, analyzeText } from './lib/career-domain';
      export { skillKey } from './lib/domain';
      export { briefSchema } from './lib/server/career-validation';
    `,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const candidate = (overrides = {}) => ({
  id: "candidate-middle",
  fullName: "Тестовый специалист",
  initials: "ТС",
  role: "Backend",
  grade: "Middle",
  qualification: {
    role: "Backend",
    grade: "Middle",
    score: 80,
    passedAt: "2026-09-01T00:00:00.000Z",
    nextChangeAt: "2026-11-30T00:00:00.000Z",
    attemptId: "test-attempt",
    synthetic: false,
  },
  city: "Москва",
  workFormat: "Удалённо",
  salaryMin: 100000,
  salaryMax: 200000,
  yearsExperience: 3,
  skills: ["Python"],
  bio: "Тестовое описание опыта",
  achievements: [],
  ...overrides,
});
const brief = (overrides = {}) => ({
  title: "Разработчик для API",
  role: "Backend",
  grade: "Middle",
  outcomes: ["Разработать API для команды"],
  mandatory: ["Python"],
  desirable: [],
  trainable: [],
  coveredSkills: [],
  salaryMin: 120000,
  salaryMax: 200000,
  workFormat: "Удалённо",
  coreHours: "",
  onCall: "discuss",
  ...overrides,
});
let checks = 0;
const test = (name, fn) => {
  fn();
  checks++;
  console.log(`PASS ${name}`);
};
const rankedIds = (candidates, need = brief()) =>
  candidates
    .map((c) => api.matchBrief(c, need, []))
    .sort(api.compareBriefMatches)
    .map((m) => m.candidate.id);

test("all nine grade pairs use the confirmed grade", () => {
  for (const own of ["Junior", "Middle", "Senior"])
    for (const needed of ["Junior", "Middle", "Senior"]) {
      const c = candidate({
        grade: needed,
        qualification: { ...candidate().qualification, grade: own },
      });
      const m = api.matchBrief(c, brief({ grade: needed }), []);
      assert.equal(m.compatible, own === needed, `${own} → ${needed}`);
      assert.equal(
        m.conditions.some((x) => x.includes("грейд")),
        own !== needed,
      );
    }
});

test("self-reported role cannot impersonate a confirmed specialisation", () => {
  const c = candidate({
    role: "Backend",
    qualification: { ...candidate().qualification, role: "Frontend" },
  });
  assert.equal(api.matchBrief(c, brief(), []).compatible, false);
  const confirmed = candidate({ role: "Frontend" });
  assert.equal(api.matchBrief(confirmed, brief(), []).compatible, true);
});

test("a profile without a test category is never a full match", () => {
  assert.equal(
    api.matchBrief(candidate({ qualification: undefined }), brief(), [])
      .compatible,
    false,
  );
});

test("legacy saved needs remain readable without inventing a grade", () => {
  const { grade: ignored, ...legacy } = brief();
  void ignored;
  const saved = api.briefSchema.parse(JSON.parse(JSON.stringify(legacy)));
  assert.equal(Object.hasOwn(saved, "grade"), false);
  assert.equal(api.matchBrief(candidate(), saved, []).compatible, true);
  assert.equal(
    api.matchBrief(candidate({ qualification: undefined }), saved, [])
      .compatible,
    false,
  );
});

test("grade validation preserves valid values and rejects unsupported inputs", () => {
  assert.equal(api.briefSchema.parse(brief({ grade: "Senior" })).grade, "Senior");
  for (const grade of ["Lead", "", null, 3])
    assert.equal(api.briefSchema.safeParse(brief({ grade })).success, false);
  assert.equal(api.briefSchema.safeParse(brief({ invented: true })).success, false);
});

test("catalogue and need aliases agree in either spelling direction", () => {
  for (const [short, long] of [
    ["JS", "JavaScript"],
    ["TS", "TypeScript"],
    ["Node", "Node.js"],
    ["postgres", "PostgreSQL"],
    ["k8s", "Kubernetes"],
  ]) {
    for (const [own, required] of [[short, long], [long, short]]) {
      assert.equal(api.normalizeSkill(own), api.skillKey(required));
      const m = api.matchBrief(
        candidate({ skills: [own] }),
        brief({ mandatory: [required], desirable: [required] }),
        [],
      );
      assert.equal(m.compatible, true, `${own} → ${required}`);
      assert.equal(m.desired, 1);
      assert.equal(m.requirements[0].status, "declared");
    }
  }
});

test("proof and relaxed-requirement aliases share the same interpretation", () => {
  const c = candidate({ skills: [] });
  const need = brief({ mandatory: ["TypeScript"] });
  const proof = {
    candidateId: c.id,
    skill: "TS",
    status: "evaluated",
    synthetic: false,
    kind: "case",
    score: 100,
    id: "proof-ts",
  };
  const evidence = api.matchBrief(c, need, [proof]);
  assert.equal(evidence.compatible, true);
  assert.deepEqual(evidence.requirements[0].proofIds, ["proof-ts"]);
  assert.equal(api.matchBrief(c, need, [], ["TS"]).compatible, true);
  assert.equal(api.matchBrief(c, need, [{ ...proof, synthetic: true }]).compatible, false);
  assert.deepEqual(api.uniqueSkills(["TS", "TypeScript", "React"]), ["TypeScript", "React"]);
});

test("stronger test results win over original ID order at equal fit", () => {
  const low = candidate({ id: "a-low", qualification: { ...candidate().qualification, score: 70 } });
  const high = candidate({ id: "z-high", qualification: { ...candidate().qualification, score: 95 } });
  assert.deepEqual(rankedIds([low, high]), ["z-high", "a-low"]);
  assert.deepEqual(rankedIds([high, low]), ["z-high", "a-low"]);
});

test("FSP evidence breaks a tie without excluding profiles without history", () => {
  const plain = candidate({ id: "a-plain" });
  const fsp = candidate({
    id: "z-fsp",
    achievements: [{ id: "fsp-record", place: 2, source: "mock-fsp" }],
  });
  assert.equal(api.matchBrief(plain, brief(), []).compatible, true);
  assert.deepEqual(rankedIds([plain, fsp]), ["z-fsp", "a-plain"]);
});

test("a high score cannot rank a wrong-grade profile before a full match", () => {
  const wrong = candidate({
    id: "a-wrong",
    qualification: { ...candidate().qualification, grade: "Senior", score: 100 },
  });
  const match = candidate({
    id: "z-match",
    qualification: { ...candidate().qualification, score: 67 },
  });
  assert.deepEqual(rankedIds([wrong, match]), ["z-match", "a-wrong"]);
});

test("equal profiles sort deterministically", () => {
  assert.deepEqual(rankedIds([candidate({ id: "z" }), candidate({ id: "a" })]), ["a", "z"]);
});

test("text draft preserves parsed requirements and an explicitly chosen grade", () => {
  const parsed = api.analyzeText("Backend разработчик. Python, PostgreSQL. Удалённо. Разработать API для клиентов.", "brief");
  assert.deepEqual(parsed.skills, ["Python", "PostgreSQL"]);
  assert.equal(parsed.role, "Backend");
  assert.equal(parsed.workFormat, "Удалённо");
  assert.equal(Object.hasOwn(parsed, "grade"), false);
  const saved = api.briefSchema.parse(brief({
    role: parsed.role,
    mandatory: parsed.skills,
    outcomes: parsed.outcomes,
    workFormat: parsed.workFormat,
    grade: "Senior",
  }));
  assert.equal(saved.grade, "Senior");
  assert.deepEqual(saved.mandatory, parsed.skills);
});

console.log(`${checks} brief matching regression groups passed.`);
