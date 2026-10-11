/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".runtime", { recursive: true });
await build({
  entryPoints: ["lib/server/assessment-engine.ts"],
  outfile: ".runtime/assessment-eval.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { createAssessment, scoreAssessment, BLUEPRINT } = await import(
  "../.runtime/assessment-eval.mjs"
);
const roles = [
  "Frontend",
  "Backend",
  "Fullstack",
  "Data Science",
  "DevOps",
  "QA",
];
const grades = ["Junior", "Middle", "Senior"];
let variants = 0,
  expiryChecks = 0,
  blockedGeneralOnly = 0;
const diversity = [];
for (const role of roles)
  for (const grade of grades) {
    const prompts = new Set();
    for (let i = 0; i < 50; i++) {
      const { assessment: a, keys } = createAssessment(
        role,
        grade,
        "ИТ-продукты",
        "Синтетическая проверка механизма",
        undefined,
        Date.UTC(2026, 9, 5, 12),
      );
      assert.equal(a.questions.length, 6);
      assert.equal(
        a.questions.filter((q) => q.kind === "professional").length,
        4,
      );
      assert.equal(new Set(a.questions.map((q) => q.id)).size, 6);
      assert.ok(!JSON.stringify(a).includes("correctIndex"));
      for (const q of a.questions) {
        assert.equal(q.options.length, 4);
        assert.equal(new Set(q.options.map((o) => o.text)).size, 4);
        assert.equal(q.options.filter((o) => o.id === keys[q.id]).length, 1);
      }
      prompts.add(
        a.questions.find((q) => q.topic === "Расчёт нагрузки").prompt,
      );
      const onlyGeneral = Object.fromEntries(
        a.questions.map((q) => [
          q.id,
          q.kind === "general"
            ? keys[q.id]
            : q.options.find((o) => o.id !== keys[q.id]).id,
        ]),
      );
      assert.equal(
        scoreAssessment(a, keys, onlyGeneral, Date.parse(a.createdAt) + 1000)
          .status,
        "failed",
      );
      blockedGeneralOnly++;
      assert.equal(
        scoreAssessment(a, keys, keys, Date.parse(a.createdAt) + 1000).status,
        "passed",
      );
      assert.equal(
        scoreAssessment(a, keys, keys, Date.parse(a.expiresAt) + 1).status,
        "expired",
      );
      expiryChecks++;
      variants++;
    }
    assert.ok(prompts.size > 1);
    diversity.push({ role, grade, loadPromptVariants: prompts.size });
  }
const report = {
  generatedAt: new Date().toISOString(),
  blueprint: BLUEPRINT,
  kind: "synthetic-mechanical-validation",
  variants,
  blueprints: 18,
  variantsPerBlueprint: 50,
  blockedGeneralOnly,
  expiryChecks,
  diversity,
  limitations: [
    "Проверяется механика и структура вариантов, а не профессиональная валидность грейда.",
    "Четыре профессиональных сценария выбираются из шести для роли/грейда. Банк из 108 вопросов требует экспертной калибровки и расширения.",
    "Нет реальных кандидатов, экспертной разметки и доказательства эквивалентной сложности. Precision/recall качества найма не измерялись.",
  ],
};
await writeFile(
  ".runtime/evaluation-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${variants} variants checked across 18 blueprints; professional threshold and expiry enforced.`,
);
