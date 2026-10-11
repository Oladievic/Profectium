/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import type { Candidate } from "./types";
import { rankingScore, skillKey } from "./domain";
import type {
  Proof,
  Brief,
  BriefMatch,
  IncomingRules,
  Terms,
} from "./career-types";
// Keep catalogue filters, needs, proofs and team coverage on one skill vocabulary.
export const normalizeSkill = skillKey;
export const uniqueSkills = (s: string[]) => [
  ...new Map(
    s.filter(Boolean).map((x) => [normalizeSkill(x), x.trim()]),
  ).values(),
];
export function baseProofs(c: Candidate): Proof[] {
  const proofs: Proof[] = [];
  if (c.qualification)
    proofs.push({
      id: "assessment:" + c.id,
      candidateId: c.id,
      title: `${c.qualification.role} / ${c.qualification.grade}`,
      skill: c.qualification.role,
      kind: "assessment",
      summary: `Результат ${c.qualification.score}/100`,
      artifact:
        "Категория присвоена по результатам пилотной проверки. Подробные ответы доступны только кандидату.",
      source: "Profectium · пилотная методика",
      status: "evaluated",
      createdAt: c.qualification.passedAt,
      published: true,
      synthetic: c.qualification.synthetic,
      limits:
        "Результат относится к проверенному набору заданий; не является сертификатом всей профессиональной квалификации.",
      score: c.qualification.score,
    });
  for (const a of c.achievements)
    proofs.push({
      id: "competition:" + a.id,
      candidateId: c.id,
      title: a.competition,
      skill: a.discipline,
      kind: "competition",
      summary: `${a.place} место из ${a.participants} · ${a.year}`,
      artifact: `Роль в записи: ${a.teamRole}. Индивидуальный вклад отдельно не подтверждён.`,
      source: a.source,
      status: "recorded",
      createdAt: `${a.year}-01-01T00:00:00.000Z`,
      published: true,
      synthetic: true,
      limits:
        "Демонстрационная запись соревнования. Не доказывает коммерческий грейд или владение конкретным стеком.",
    });
  return proofs;
}
export function conditionIssues(
  r: IncomingRules | undefined,
  t: Pick<
    Terms,
    "salaryMin" | "salaryMax" | "workFormat" | "coreHours" | "onCall"
  >,
): string[] {
  if (!r) return [];
  const issues: string[] = [];
  if (t.salaryMin < r.minimumSalary)
    issues.push("Нижняя граница зарплаты ниже условия кандидата");
  if (r.formats.length && !r.formats.includes(t.workFormat))
    issues.push("Формат работы требует согласования");
  if (r.onCall === "no" && t.onCall !== "no")
    issues.push("Кандидат не рассматривает дежурства");
  if (
    r.coreHours &&
    r.coreHours.trim().toLowerCase() !== t.coreHours.trim().toLowerCase()
  )
    issues.push("Рабочие часы требуют согласования");
  return issues;
}
export function matchBrief(
  c: Candidate,
  b: Brief,
  proofs: Proof[],
  relaxed: string[] = [],
): BriefMatch {
  const declared = new Set(c.skills.map(normalizeSkill));
  const requirements = b.mandatory.map((skill) => {
    const key = normalizeSkill(skill),
      ps = proofs.filter(
        (p) =>
          p.candidateId === c.id &&
          normalizeSkill(p.skill) === key &&
          p.status === "evaluated" &&
          !p.synthetic &&
          (p.kind !== "case" || p.score === 100),
      );
    return {
      skill,
      status: ps.length
        ? ("evidence" as const)
        : declared.has(key)
          ? ("declared" as const)
          : ("missing" as const),
      proofIds: ps.map((p) => p.id),
    };
  });
  const missing = requirements
    .filter(
      (x) =>
        x.status === "missing" &&
        !relaxed.map(normalizeSkill).includes(normalizeSkill(x.skill)),
    )
    .map((x) => x.skill);
  const conditions = conditionIssues(c.incomingRules ?? c.controls?.rules, b);
  if (!c.qualification) conditions.push("Категория ещё не подтверждена");
  else {
    if (c.qualification.role !== b.role)
      conditions.push("Другая подтверждённая специализация");
    if (b.grade && c.qualification.grade !== b.grade)
      conditions.push(`Требуется подтверждённый грейд ${b.grade}`);
  }
  if (c.salaryMin > b.salaryMax || c.salaryMax < b.salaryMin)
    conditions.push("Зарплатные диапазоны не пересекаются");
  if (c.workFormat !== b.workFormat)
    conditions.push("Формат профиля отличается");
  return {
    candidate: c,
    requirements,
    missing,
    conditions,
    desired: b.desirable.filter((s) => declared.has(normalizeSkill(s))).length,
    evidenceCount: requirements.filter((x) => x.status === "evidence").length,
    compatible: !missing.length && !conditions.length,
  };
}
export function compareBriefMatches(a: BriefMatch, b: BriefMatch) {
  return (
    Number(b.compatible) - Number(a.compatible) ||
    a.missing.length - b.missing.length ||
    b.evidenceCount - a.evidenceCount ||
    rankingScore(b.candidate) - rankingScore(a.candidate) ||
    a.candidate.id.localeCompare(b.candidate.id)
  );
}
export function analyzeText(text: string, kind: "resume" | "brief") {
  const dictionary = [
    "JavaScript",
    "TypeScript",
    "React",
    "Vue",
    "Next.js",
    "Node.js",
    "Python",
    "FastAPI",
    "Django",
    "Go",
    "Java",
    "PostgreSQL",
    "SQL",
    "Redis",
    "Docker",
    "Kubernetes",
    "Terraform",
    "Linux",
    "Playwright",
    "Postman",
    "pandas",
    "NumPy",
    "scikit-learn",
    "CatBoost",
    "MLflow",
    "HTML",
    "CSS",
    "Git",
  ];
  const lower = text.toLowerCase();
  const skills = dictionary.filter((s) =>
    new RegExp(
      "(^|[^a-z0-9])" +
        s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "([^a-z0-9]|$)",
      "i",
    ).test(lower),
  );
  const role = /devops|инфраструктур|kubernetes/i.test(text)
    ? "DevOps"
    : /data scien|модел|pandas/i.test(text)
      ? "Data Science"
      : /qa|тестиров/i.test(text)
        ? "QA"
        : /fullstack|full.stack/i.test(text)
          ? "Fullstack"
          : /frontend|фронтенд|react|vue/i.test(text)
            ? "Frontend"
            : "Backend";
  const lines = text
    .split(/[\n.!?]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 12);
  return {
    kind,
    engine: "rules",
    skills,
    role,
    workFormat: /удал[её]н|remote/i.test(text)
      ? "Удалённо"
      : /гибрид/i.test(text)
        ? "Гибрид"
        : "Офис",
    outcomes: lines.slice(0, 3),
    warnings: [
      "Черновик по словарю и правилам. Проверьте каждое поле перед сохранением.",
      "Извлечённые навыки остаются самоописанием; текст не подтверждает опыт.",
    ],
  };
}
