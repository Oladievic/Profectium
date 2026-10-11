/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

// Server only. Full test definitions/snapshots contain answer keys.
import { database, candidate } from "./store";
import type { AccessContext } from "./access";
import { ServiceError } from "./security";
import { candidateGuard, ownedRow, record, records, role, updateStatement, type Row } from "./career-store";
import type {
  EmployerQuestion, EmployerTest, EmployerTestAnswers, EmployerTestAttempt,
  EmployerTestAttemptSummary, EmployerTestDefinition, EmployerTestResult, EmployerTestReview, EmployerTestsState,
} from "../employer-test-types";

export type StoredTest = EmployerTestDefinition & {
  state: EmployerTest["state"]; updatedAt: string; publishedAt: string | null;
};
export type StoredEmployerAttempt = {
  testId: string; testRevision: number; snapshot: EmployerTestDefinition; employerName: string;
  state: EmployerTestAttempt["state"]; dueAt: string; updatedAt: string;
  startedAt: string | null; submittedAt: string | null; reviewedAt: string | null;
  expired: boolean; answers: EmployerTestAnswers; result: EmployerTestResult | null;
};
export const testView = (r: Row): EmployerTest => {
  const d = JSON.parse(r.data) as StoredTest;
  return { ...d, id: r.id, revision: r.revision, createdAt: r.created_at };
};
export async function employerTestRow(ctx: AccessContext, id: string) {
  role(ctx, "employer");
  const r = await record(ctx, "employer-test", id);
  if (!r || r.employer_id !== ctx.account.owner) throw new ServiceError(404, "Тест не найден.");
  return r;
}
export function normalizeAnswers(questions: EmployerQuestion[], input: EmployerTestAnswers): EmployerTestAnswers {
  if (Object.keys(input).some((id) => !questions.some((q) => q.id === id)))
    throw new ServiceError(422, "Ответ содержит неизвестный вопрос.");
  const result: EmployerTestAnswers = {};
  for (const q of questions) {
    const answer = Object.hasOwn(input, q.id) ? input[q.id] : undefined;
    if (q.kind === "text") {
      if (answer !== undefined && typeof answer !== "string") throw new ServiceError(422, "Для открытого вопроса нужен текст.");
      result[q.id] = typeof answer === "string" ? answer : "";
    } else {
      if (answer !== undefined && !Array.isArray(answer)) throw new ServiceError(422, "Варианты ответа передаются списком.");
      const ids = Array.isArray(answer) ? answer : [];
      if (new Set(ids).size !== ids.length || ids.some((id) => !q.options.some((o) => o.id === id)) || (q.kind === "single" && ids.length > 1))
        throw new ServiceError(422, "Проверьте выбранные варианты ответа.");
      result[q.id] = [...ids].sort();
    }
  }
  return result;
}
const answered = (answer: string | string[]) => typeof answer === "string" ? !!answer.trim() : !!answer.length;
export function scoreEmployerTest(snapshot: EmployerTestDefinition, answers: EmployerTestAnswers, reviews?: EmployerTestReview[], feedback = ""): EmployerTestResult {
  const breakdown = snapshot.questions.map((q) => {
    if (q.kind === "text") {
      const review = reviews?.find((r) => r.questionId === q.id);
      return { questionId: q.id, points: review?.points ?? null, maxPoints: q.points, correct: null, feedback: review?.feedback ?? "Ожидает ручной оценки по опубликованным критериям.", manual: true };
    }
    const ids = answers[q.id] as string[];
    const correct = ids.length === q.correctOptionIds.length && q.correctOptionIds.every((id) => ids.includes(id));
    return { questionId: q.id, points: correct ? q.points : 0, maxPoints: q.points, correct, feedback: q.explanation || (correct ? "Ответ соответствует ключу работодателя." : "Ответ не совпал с ключом работодателя."), manual: false };
  });
  const earnedPoints = breakdown.reduce((n, q) => n + (q.points ?? 0), 0);
  const maxPoints = breakdown.reduce((n, q) => n + q.maxPoints, 0);
  const pendingReview = breakdown.filter((q) => q.points === null).length;
  const final = pendingReview === 0;
  // Compare the unrounded ratio: 66.666% must not pass a 67% threshold.
  return { earnedPoints, maxPoints, percent: final ? Math.round(10000 * earnedPoints / maxPoints) / 100 : null,
    passed: final ? earnedPoints * 100 >= maxPoints * snapshot.passingPercent : null,
    pendingReview, final, feedback, breakdown };
}
export function finishAttempt(d: StoredEmployerAttempt, answers: EmployerTestAnswers, expired = false): StoredEmployerAttempt {
  const result = scoreEmployerTest(d.snapshot, answers);
  const at = new Date().toISOString();
  return { ...d, answers, result, state: result.final ? "reviewed" : "submitted", submittedAt: at,
    reviewedAt: result.final ? at : null, updatedAt: at, expired };
}
export function attemptView(ctx: AccessContext, row: Row, detailed: true): EmployerTestAttempt;
export function attemptView(ctx: AccessContext, row: Row, detailed?: false): EmployerTestAttemptSummary;
export function attemptView(ctx: AccessContext, row: Row, detailed = false): EmployerTestAttempt | EmployerTestAttemptSummary {
  const d = JSON.parse(row.data) as StoredEmployerAttempt;
  const submitted = ["submitted", "reviewed"].includes(d.state);
  const canReadAnswers = ctx.account.role === "candidate" || submitted;
  const summary: EmployerTestAttemptSummary = {
    id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: d.updatedAt,
    testId: d.testId, testRevision: d.testRevision, title: d.snapshot.title, skill: d.snapshot.skill,
    employerId: row.employer_id, employerName: d.employerName, candidateId: row.candidate_id,
    dueAt: d.dueAt, estimatedMinutes: d.snapshot.estimatedMinutes, questionCount: d.snapshot.questions.length,
    state: d.state, startedAt: d.startedAt, submittedAt: d.submittedAt, reviewedAt: d.reviewedAt,
    expired: d.expired || (["invited", "active"].includes(d.state) && Date.parse(d.dueAt) <= Date.now()),
    savedAnswers: canReadAnswers ? Object.values(d.answers).filter(answered).length : 0,
    result: submitted ? d.result : null,
  };
  if (!detailed) return summary;
  return { ...summary, description: d.snapshot.description, passingPercent: d.snapshot.passingPercent,
    questions: d.snapshot.questions.map(({ correctOptionIds, explanation, ...q }) => {
      void correctOptionIds; void explanation; return q;
    }), answers: canReadAnswers ? d.answers : {} };
}
/** An expired active attempt is graded exclusively from its last committed answers. */
export async function finalizeExpired(ctx: AccessContext, row: Row) {
  const d = JSON.parse(row.data) as StoredEmployerAttempt;
  if (d.state !== "active" || Date.parse(d.dueAt) > Date.now()) return row;
  const c = await candidate(ctx.dataOwner, row.candidate_id);
  if (!c?.privacy?.processing) throw new ServiceError(404, "Данные профиля недоступны.");
  const guard = candidateGuard(ctx, c.id, c.revision);
  await updateStatement(ctx, row, row.revision, finishAttempt(d, normalizeAnswers(d.snapshot.questions, d.answers), true),
    guard.sql + " AND julianday(json_extract(data,'$.dueAt'))<=julianday('now')", guard.args).run();
  return (await ownedRow(ctx, "employer-attempt", row.id));
}
export async function employerAttemptRow(ctx: AccessContext, id: string) {
  return finalizeExpired(ctx, await ownedRow(ctx, "employer-attempt", id));
}
export async function employerTestsState(ctx: AccessContext): Promise<EmployerTestsState> {
  const rows = await database().prepare(
    `SELECT * FROM career_records WHERE owner=? AND kind='employer-attempt' AND ${ctx.account.role === "candidate" ? "candidate_id" : "employer_id"}=? ORDER BY created_at DESC`,
  ).bind(ctx.dataOwner, ctx.account.role === "candidate" ? ctx.account.candidate_id : ctx.account.owner).all<Row>();
  const attempts: EmployerTestAttemptSummary[] = [];
  for (const row of rows.results) {
    if (!(await candidate(ctx.dataOwner, row.candidate_id))?.privacy?.processing) continue;
    try { attempts.push(attemptView(ctx, await finalizeExpired(ctx, row))); }
    catch (error) { if (!(error instanceof ServiceError && error.status === 404)) throw error; }
  }
  return { tests: ctx.account.role === "employer" ? (await records(ctx, "employer-test")).filter((r) => r.employer_id === ctx.account.owner).map(testView) : [], attempts };
}
