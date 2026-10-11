/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const project = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(project, "package.json"));
const { build } = require("esbuild");
const compiled = await build({
  absWorkingDir: project,
  stdin: { resolveDir: project, contents: "export * from './lib/query-parser'; export * from './lib/domain';", sourcefile: "query-test.ts" },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
});
const { parseSearchIntent: parse, filterCandidates } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
let groups = 0;
function test(name, fn) { fn(); groups++; console.log("PASS", name); }
test("Russian query converts exactly to confirmed category and rouble budget", () => {
  const result = parse("Найди backend middle с Python и PostgreSQL, удалённо, до 250 тыс, с опытом ФСП");
  assert.equal(result.canApply, true);
  assert.deepEqual(result.filters, { query: "Python PostgreSQL", role: "Backend", grade: "Middle", format: "Удалённо", maxSalary: "250000", hasAchievements: true, discipline: "all", jobId: "all", sort: "relevance" });
  assert.deepEqual(result.remainingTerms, []);
});
test("EN aliases and Cyrillic grade", () => {
  const f = parse("фронтенд мидл React TypeScript гибрид до 300k").filters;
  assert.equal(f.role, "Frontend"); assert.equal(f.grade, "Middle"); assert.equal(f.format, "Гибрид"); assert.equal(f.maxSalary, "300000");
});
test("All six specializations", () => {
  for (const [query, role] of [["front end", "Frontend"], ["бэкенд", "Backend"], ["full-stack", "Fullstack"], ["data scientist", "Data Science"], ["девопс", "DevOps"], ["тестировщик", "QA"]]) assert.equal(parse(query).filters.role, role, query);
});
test("Senior and Junior variants", () => {
  for (const q of ["джуниор", "стажёр", "junior"]) assert.equal(parse(q).filters.grade, "Junior");
  for (const q of ["синьор", "сеньор", "senior"]) assert.equal(parse(q).filters.grade, "Senior");
});
test("Currency variants preserve rouble values", () => {
  for (const [query, expected] of [["до 250к", "250000"], ["бюджет 250 тыс.", "250000"], ["до 250 000 ₽", "250000"], ["до 250000 рублей", "250000"], ["до 250,5k", "250500"], ["до 900", "900"]]) assert.equal(parse(query).filters.maxSalary, expected, query);
});
test("Bare amount is a disclosed assumption", () => { const r = parse("Backend 250к"); assert.equal(r.filters.maxSalary, "250000"); assert.ok(r.warnings.some(x => x.includes("без «до»"))); });
test("Small unitless amount warns, never guesses thousands", () => { const r = parse("до 250"); assert.equal(r.filters.maxSalary, "250"); assert.ok(r.warnings.some(x => x.includes("без единицы"))); });
test("Multiple or invalid budgets are blocked", () => { for (const q of ["до 0", "до 900000000", "до 200к до 300к", "от 200 тыс", "200–250к"]) assert.equal(parse(q).canApply, false, q); });
test("OR cannot silently become AND", () => { for (const q of ["Python или Go", "Python OR Go"]) assert.equal(parse(q).canApply, false); });
test("Negative unsupported conditions cannot reverse meaning", () => { for (const q of ["без ФСП", "не Junior", "кроме офиса", "not React"]) assert.equal(parse(q).canApply, false, q); });
test("Conflicting categories and formats blocked", () => { for (const q of ["Backend Frontend", "Junior Senior", "удалённо офис"]) assert.equal(parse(q).canApply, false, q); });
test("Specialization not inferred from ambiguous stack", () => { const r = parse("питон мидл"); assert.equal(r.filters.role, "all"); assert.equal(r.filters.query, "Python"); assert.ok(r.inferredRole); assert.ok(r.warnings.some(x => x.includes("всем категориям"))); });
test("Explicit ML category survives Python", () => { const r = parse("ML Senior Python"); assert.equal(r.filters.role, "Data Science"); assert.equal(r.filters.query, "Python"); assert.equal(r.inferredRole, false); });
test("Unknown tools and location remain in query and are disclosed", () => { const r = parse("Backend Middle Rust Elixir Казань"); assert.match(r.filters.query, /Rust/); assert.match(r.filters.query, /elixir/); assert.match(r.filters.query, /казань/); assert.ok(r.warnings.some(x => x.includes("Осталось"))); });
test("Substring matches do not invent JS, TS, Go or roles", () => { for (const q of ["Django", "Django mongoose", "jobs reports", "prebackend", "google"]) { const r = parse(q); assert.equal(r.filters.role, "all", q); assert.equal(r.skills.includes("Go"), false, q); assert.equal(r.skills.includes("JavaScript"), false, q); assert.equal(r.skills.includes("TypeScript"), false, q); } });
test("Longer aliases and punctuation preserve actual skills", () => { const r = parse("Node.js, C++, C#, PostgreSQL, React.js"); assert.deepEqual(r.skills, ["React", "Node.js", "PostgreSQL", "C++", "C#"]); assert.deepEqual(r.remainingTerms, []); });
test("Role-suffixed title does not leave empty hyphen keyword", () => { const r = parse("Backend-разработчик Middle"); assert.equal(r.filters.query, ""); });
test("All skill terms use existing domain AND semantics", () => {
  const f = parse("Backend Middle Python PostgreSQL удалённо до 250к").filters;
  const candidate = (id, skills, opts = {}) => ({ id, fullName: id, role: "Backend", grade: "Senior", city: "", bio: "", skills, workFormat: "Удалённо", salaryMin: 200000, salaryMax: 300000, achievements: [], qualification: { role: "Backend", grade: "Middle", score: 80 }, ...opts });
  const rows = [candidate("both", ["Python", "PostgreSQL"]), candidate("one", ["Python"]), candidate("wrong-grade", ["Python", "PostgreSQL"], { qualification: { role: "Backend", grade: "Senior", score: 90 } }), candidate("costly", ["Python", "PostgreSQL"], { salaryMin: 280000 }), candidate("offline", ["Python", "PostgreSQL"], { available: false })];
  assert.deepEqual(filterCandidates(rows, f, []).map(c => c.id), ["both"]);
});
test("FSP is an optional positive signal unless requested", () => { assert.equal(parse("Backend").filters.hasAchievements, false); assert.equal(parse("Backend хакатон").filters.hasAchievements, true); });
test("No mutation or shared-filter contamination", () => { const a = parse("Backend"); a.filters.role = "QA"; assert.equal(parse("React").filters.role, "all"); });
test("Empty and oversized requests rejected", () => { assert.equal(parse("   ").canApply, false); assert.equal(parse("x".repeat(501)).canApply, false); });
console.log(`Query parser: ${groups} regression groups passed.`);
