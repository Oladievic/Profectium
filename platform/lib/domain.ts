/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import type { Candidate, Job, Filters } from "./types";
export const normalize = (s: string) =>
  s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
export function skillKey(s: string) {
  const key = normalize(s).replace(/[.\s-]/g, "");
  return (
    (
      {
        js: "javascript",
        ts: "typescript",
        node: "nodejs",
        postgres: "postgresql",
        k8s: "kubernetes",
      } as Record<string, string>
    )[key] ?? key
  );
}
export function matchCandidate(c: Candidate, j: Job) {
  const own = new Set(c.skills.map(skillKey));
  const matched = j.skills.filter((s) => own.has(skillKey(s)));
  const salary = c.salaryMin <= j.salaryMax && c.salaryMax >= j.salaryMin;
  const role = c.qualification?.role === j.role;
  const grade = c.qualification?.grade === j.grade;
  return {
    matched,
    missing: j.skills.filter((s) => !own.has(skillKey(s))),
    salary,
    role,
    grade,
    score: rankingScore(c, j),
    reasons: [
      ...(role ? ["Совпадает специализация"] : []),
      ...(grade ? ["Подтверждён нужный уровень"] : []),
      ...rankingReasons(c),
      ...matched.map((s) => `${s} указан в профиле`),
      ...(salary ? ["Зарплатные диапазоны пересекаются"] : []),
    ],
  };
}
export function filterCandidates(list: Candidate[], f: Filters, jobs: Job[]) {
  const words = normalize(f.query).split(/\s+/).filter(Boolean);
  const job = jobs.find((j) => j.id === f.jobId);
  const filtered = list.filter((c) => {
    const text = normalize(
      [c.fullName, c.role, c.city, c.bio, ...c.skills].join(" "),
    );
    return (
      c.available !== false &&
      !!c.qualification &&
      words.every(
        (w) =>
          text.includes(w) || c.skills.some((s) => skillKey(s) === skillKey(w)),
      ) &&
      (f.role === "all" || c.qualification.role === f.role) &&
      (f.grade === "all" || c.qualification.grade === f.grade) &&
      (f.format === "all" || c.workFormat === f.format) &&
      (!f.maxSalary || c.salaryMin <= Number(f.maxSalary)) &&
      (!f.hasAchievements || c.achievements.length > 0) &&
      (f.discipline === "all" ||
        c.achievements.some((a) => a.discipline === f.discipline)) &&
      (!job ||
        (c.qualification.role === job.role &&
          c.qualification.grade === job.grade))
    );
  });
  return filtered.sort((a, b) =>
    f.sort === "salary"
      ? a.salaryMin - b.salaryMin
      : f.sort === "experience"
        ? b.yearsExperience - a.yearsExperience
        : rankingScore(b, job) - rankingScore(a, job) ||
          a.id.localeCompare(b.id),
  );
}
export function categories(c: Candidate) {
  return [
    ...(c.qualification
      ? [
          {
            label: `${c.qualification.role} · ${c.qualification.grade}`,
            basis: `${c.qualification.synthetic ? "Демонстрационный результат" : "Результат теста"}: ${c.qualification.score}/100. Пилотная оценка; не является сертификатом квалификации.`,
            source: "assessment",
          },
        ]
      : [
          {
            label: "Категория ещё не присвоена",
            basis:
              "Пройдите опрос и тестирование. Заявленный грейд не влияет на категорию.",
            source: "pending",
          },
        ]),
    ...Array.from(new Set(c.achievements.map((a) => a.discipline))).map(
      (label) => ({
        label,
        basis: "Категория по дисциплине импортированного достижения",
        source: "mock-fsp",
      }),
    ),
  ];
}
export function evidencePoints(c: Candidate) {
  if (!c.achievements.length) return 0;
  return Math.min(
    20,
    8 +
      c.achievements.length * 2 +
      (c.achievements.some((a) => a.place <= 3) ? 6 : 0),
  );
}
export function rankingScore(c: Candidate, j?: Job) {
  const own = new Set(c.skills.map(skillKey));
  const skills = j
    ? (15 * j.skills.filter((s) => own.has(skillKey(s))).length) /
      Math.max(j.skills.length, 1)
    : 0;
  const pay =
    j && c.salaryMin <= j.salaryMax && c.salaryMax >= j.salaryMin ? 5 : 0;
  return Math.round(
    (c.qualification?.score ?? 0) * 0.6 + evidencePoints(c) + skills + pay,
  );
}
export function rankingReasons(c: Candidate) {
  return [
    `Тест: ${c.qualification?.score ?? 0}/100 → ${Math.round((c.qualification?.score ?? 0) * 0.6)} баллов`,
    c.achievements.length
      ? `Результаты ФСП (демо): +${evidencePoints(c)} баллов`
      : "Без истории ФСП: категория доступна, бонус не начисляется",
  ];
}
export const money = (v: number) => new Intl.NumberFormat("ru-RU").format(v);
export const salary = (min: number, max: number) =>
  `${money(min)}–${money(max)} ₽`;
export const roleLabel = (role: string) =>
  ({
    Frontend: "Frontend-разработчик",
    Backend: "Backend-разработчик",
    Fullstack: "Fullstack-разработчик",
    "Data Science": "Data Scientist",
    DevOps: "DevOps-инженер",
    QA: "QA-инженер",
  })[role] ?? role;
export const statusLabel = (status: string) =>
  ({
    pending: "Ожидает ответа",
    accepted: "Принято",
    declined: "Отклонено",
    withdrawn: "Отозвано",
  })[status] ?? status;
