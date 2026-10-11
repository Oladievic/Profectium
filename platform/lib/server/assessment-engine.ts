/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

// Server-only: this module and the answer bank must never be imported by client components.
import bank from "./assessment-bank.json";
import type { Assessment, Grade, Role, Question, Candidate } from "../types";
export const COOLDOWN_DAYS = 90;
export const BLUEPRINT = "profectium-pilot-3";
const day = 86400000;
const random = (min: number, max: number) =>
  min + (crypto.getRandomValues(new Uint32Array(1))[0] % (max - min + 1));
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = random(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function eligibility(
  c: Candidate,
  role: Role,
  grade: Grade,
  history: Assessment[],
  now = Date.now(),
) {
  if (
    c.qualification &&
    (c.qualification.grade !== grade || c.qualification.role !== role) &&
    Date.parse(c.qualification.nextChangeAt) > now
  )
    return `Категорию можно изменить после ${new Date(c.qualification.nextChangeAt).toLocaleDateString("ru-RU")}. Текущий результат сохранён.`;
  const previous = history.find(
    (a) =>
      a.role === role &&
      a.grade === grade &&
      a.status !== "active" &&
      Date.parse(a.createdAt) > now - day,
  );
  return previous
    ? "Повтор этого уровня доступен через 24 часа после начала предыдущей попытки. Если категория ещё не присвоена, можно выбрать уровень ниже."
    : null;
}
export function createAssessment(
  role: Role,
  grade: Grade,
  industry: string,
  motivation: string,
  job?: { id: string; title: string; skills: string[] },
  now = Date.now(),
) {
  const questions: Question[] = [];
  const keys: Record<string, string> = {};
  const add = (
    topic: string,
    prompt: string,
    choices: string[],
    correct = 0,
    kind: "general" | "professional" = "general",
  ) => {
    const id = crypto.randomUUID();
    const options = choices.map((text, i) => ({
      id: crypto.randomUUID(),
      text,
      correct: i === correct,
    }));
    keys[id] = options.find((x) => x.correct)!.id;
    questions.push({
      id,
      topic,
      prompt,
      kind,
      options: shuffle(options).map(({ id, text }) => ({ id, text })),
    });
  };
  const level = ["Junior", "Middle", "Senior"].indexOf(grade);
  const context = {
    Frontend: "интерфейса",
    Backend: "API",
    Fullstack: "веб-приложения",
    "Data Science": "обработки данных",
    DevOps: "инфраструктуры",
    QA: "автотестов",
  }[role];
  // Bounded parameter domains keep the same number of operations and rubric per grade.
  const batches = random(4, 12),
    per = random(3, 9),
    workers = random(2, 4),
    repeats = level === 2 ? random(2, 4) : 1;
  const expected =
    level === 0 ? batches * per : Math.ceil(batches / workers) * per * repeats;
  add(
    "Расчёт нагрузки",
    level === 0
      ? `Для ${context} нужно обработать ${batches} независимых пакетов последовательно. Каждый занимает ${per} мс. Накладных расходов нет. Сколько мс займут все пакеты?`
      : `Для ${context}: ${batches} пакетов, ${workers} одинаковых исполнителя, каждый пакет занимает ${per} мс. Исполнители стартуют одновременно, после завершения берут следующий пакет.${level === 2 ? ` Нужно выполнить ${repeats} таких серий строго последовательно.` : ""} Накладных расходов нет. Время завершения всех работ, мс?`,
    [
      String(expected),
      String(expected + per),
      String(Math.max(1, expected - per)),
      String(expected + 2 * per),
    ],
  );
  for (const task of shuffle(
    bank.filter((t) => t.role === role && t.grade === grade),
  ).slice(0, 4))
    add(
      task.topic,
      task.prompt,
      task.options,
      task.correctIndex,
      "professional",
    );
  const n = random(3, 8),
    threshold = n * 10;
  add(
    "Граничные условия",
    level === 0
      ? `Поле допускает целое число от ${n} до ${threshold} включительно. Какой набор проверяет обе допустимые границы и ближайшие недопустимые значения?`
      : `API принимает целое limit в [${n}, ${threshold}], а offset — целое ≥ 0. Какая пара гарантированно нарушает ровно одно из этих двух ограничений?`,
    level === 0
      ? [
          [n - 1, n, threshold, threshold + 1].join(", "),
          [n, n + 1, threshold - 1, threshold].join(", "),
          [n + 1, n + 2, threshold - 1].join(", "),
          [0, 1, 2].join(", "),
        ]
      : [
          `limit=${threshold + 1}, offset=0`,
          `limit=${threshold + 1}, offset=-1`,
          `limit=${n}, offset=0`,
          `limit=${n + 1}, offset=1`,
        ],
  );
  if (questions.length !== 6)
    throw new Error("Assessment blueprint must contain exactly 6 tasks");
  const assessment: Assessment = {
    id: crypto.randomUUID(),
    role,
    grade,
    industry,
    motivation,
    jobId: job?.id,
    jobTitle: job?.title,
    status: "active",
    draftRevision: 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 60000).toISOString(),
    questions: shuffle(questions),
    blueprint: BLUEPRINT,
    rubric: { minimumTotal: 4, minimumProfessional: 3, bankVersion: BLUEPRINT },
  };
  return { assessment, keys };
}
export function scoreAssessment(
  a: Assessment,
  keys: Record<string, string>,
  answers: Record<string, string>,
  now = Date.now(),
): Assessment {
  if (a.status !== "active") throw new Error("Attempt already completed");
  const feedback = a.questions.map((q) => ({
    topic: q.topic,
    correct: keys[q.id] === answers[q.id],
  }));
  const correct = feedback.filter((f) => f.correct).length;
  const professionalCorrect = a.questions.filter(
    (q) => q.kind === "professional" && keys[q.id] === answers[q.id],
  ).length;
  const expired = now >= Date.parse(a.expiresAt);
  return {
    ...a,
    status: expired
      ? "expired"
      : correct >= (a.rubric?.minimumTotal ?? 4) &&
          professionalCorrect >= (a.rubric?.minimumProfessional ?? 2)
        ? "passed"
        : "failed",
    completedAt: new Date(now).toISOString(),
    score: Math.round((correct / 6) * 100),
    feedback,
    answers,
  };
}
