/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { getCurrentUser } from "@/app/session-auth";
import { resolveAccess } from "@/lib/server/access";
import { candidate, company } from "@/lib/server/store";
import { readJson, response, ServiceError, limit } from "@/lib/server/security";
import { candidateGuard, changed, insertStatement, record, role, updateStatement, visibleCandidate } from "@/lib/server/career-store";
import { attemptActionSchema, createTestSchema, editTestSchema, invitationSchema, publishableTestSchema, testActionSchema } from "@/lib/server/employer-test-validation";
import { attemptView, employerAttemptRow, employerTestRow, employerTestsState, finishAttempt, normalizeAnswers, scoreEmployerTest, testView, type StoredEmployerAttempt, type StoredTest } from "@/lib/server/employer-test-store";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
const now = () => new Date().toISOString();

async function handle(req: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError(401, "Войдите в Profectium.");
    const url = new URL(req.url), ctx = await resolveAccess(user.userId, url.pathname.startsWith("/api/live/"));
    const { path } = await context.params, method = req.method;
    if (path.length > 3) throw new ServiceError(404, "Раздел не найден.");
    if (method === "GET") {
      if (path.join("/") === "state") return response(await employerTestsState(ctx));
      if (path[0] === "attempts" && path.length === 2) return response({ attempt: attemptView(ctx, await employerAttemptRow(ctx, path[1]), true) });
      if (path[0] === "tests" && path.length === 2) return response({ test: testView(await employerTestRow(ctx, path[1])) });
      throw new ServiceError(404, "Раздел не найден.");
    }
    if (!["POST", "PUT", "PATCH"].includes(method)) throw new ServiceError(405, "Метод не поддерживается.");
    if (req.headers.get("origin") !== url.origin) throw new ServiceError(403, "Запрос должен поступить с этой страницы.");
    if (req.headers.get("x-session-revision") !== String(ctx.account.revision)) throw new ServiceError(409, "Роль изменилась. Обновите страницу.");
    const input = await readJson(req, 262144);
    if (method === "POST" && path.join("/") === "tests") {
      role(ctx, "employer");
      const v = createTestSchema.parse(input), existing = await record(ctx, "employer-test", v.id);
      if (existing) {
        const old = testView(existing);
        const { id, revision, state, updatedAt, publishedAt, createdAt, ...definition } = old;
        void id; void revision; void state; void updatedAt; void publishedAt; void createdAt;
        if (old.state === "draft" && JSON.stringify(definition) === JSON.stringify(v.data)) return response({ test: old });
        throw new ServiceError(409, "Идентификатор теста уже занят.");
      }
      await limit("employer-test-create:" + ctx.account.owner, 30, 3600000);
      changed((await insertStatement(ctx, "employer-test", v.id, { ...v.data, state: "draft", updatedAt: now(), publishedAt: null }, "", ctx.account.owner,
        "AND (SELECT COUNT(*) FROM career_records WHERE owner=? AND kind='employer-test')<100", [ctx.account.owner]).run()).meta.changes);
      return response({ test: testView(await employerTestRow(ctx, v.id)) }, 201);
    }
    if (path[0] === "tests" && path.length === 2 && ["PUT", "PATCH"].includes(method)) {
      const row = await employerTestRow(ctx, path[1]), old = JSON.parse(row.data) as StoredTest;
      if (method === "PUT") {
        const v = editTestSchema.parse(input);
        if (old.state !== "draft") throw new ServiceError(409, "Опубликованный тест неизменяем. Создайте копию для новой версии.");
        changed((await updateStatement(ctx, row, v.revision, { ...v.data, state: "draft", updatedAt: now(), publishedAt: null }).run()).meta.changes);
      } else {
        const v = testActionSchema.parse(input);
        if (v.action === "publish") {
          if (old.state !== "draft") throw new ServiceError(409, "Публиковать можно только черновик.");
          publishableTestSchema.parse({ title: old.title, description: old.description, skill: old.skill, estimatedMinutes: old.estimatedMinutes, passingPercent: old.passingPercent, questions: old.questions });
        } else if (old.state === "archived") throw new ServiceError(409, "Тест уже в архиве.");
        changed((await updateStatement(ctx, row, v.revision, { ...old, state: v.action === "publish" ? "published" : "archived", updatedAt: now(), publishedAt: v.action === "publish" ? now() : old.publishedAt }).run()).meta.changes);
      }
      return response({ test: testView(await employerTestRow(ctx, row.id)) });
    }
    if (path[0] === "tests" && path.length === 3 && path[2] === "invitations" && method === "POST") {
      const v = invitationSchema.parse(input), row = await employerTestRow(ctx, path[1]);
      const test = testView(row);
      const existing = await record(ctx, "employer-attempt", v.id);
      if (existing) {
        const d = JSON.parse(existing.data) as StoredEmployerAttempt;
        if (existing.employer_id === ctx.account.owner && existing.candidate_id === v.candidateId && d.testId === row.id && d.testRevision === v.revision && d.dueAt === v.dueAt)
          return response({ attempt: attemptView(ctx, await employerAttemptRow(ctx, existing.id), true) });
        throw new ServiceError(409, "Идентификатор приглашения уже занят.");
      }
      if (row.revision !== v.revision || test.state !== "published") throw new ServiceError(409, "Выберите актуальный опубликованный тест.");
      if (Date.parse(v.dueAt) < Date.now() + 3600000 || Date.parse(v.dueAt) > Date.now() + 30 * 86400000) throw new ServiceError(422, "Укажите срок от часа до 30 дней.");
      const c = await visibleCandidate(ctx, v.candidateId), guard = candidateGuard(ctx, c.id, c.revision!);
      const snapshot = publishableTestSchema.parse({ title: test.title, description: test.description, skill: test.skill, estimatedMinutes: test.estimatedMinutes, passingPercent: test.passingPercent, questions: test.questions });
      const data: StoredEmployerAttempt = { testId: row.id, testRevision: row.revision, snapshot, employerName: (await company(ctx.account.owner)).name || "Работодатель", state: "invited", dueAt: v.dueAt, updatedAt: now(), startedAt: null, submittedAt: null, reviewedAt: null, expired: false, answers: {}, result: null };
      await limit("employer-test-invite:" + ctx.account.owner, 100, 3600000);
      changed((await insertStatement(ctx, "employer-attempt", v.id, data, c.id, ctx.account.owner,
        guard.sql + " AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND json_extract(data,'$.privacy.publication')=1 AND json_extract(data,'$.available')=1 AND json_extract(data,'$.qualification') IS NOT NULL) AND EXISTS(SELECT 1 FROM career_records WHERE owner=? AND kind='employer-test' AND id=? AND revision=? AND json_extract(data,'$.state')='published') AND NOT EXISTS(SELECT 1 FROM career_records WHERE owner=? AND kind='employer-attempt' AND employer_id=? AND candidate_id=? AND json_extract(data,'$.testId')=?) AND (SELECT COUNT(*) FROM career_records WHERE owner=? AND kind='employer-attempt' AND employer_id=?)<500",
        [...guard.args, ctx.dataOwner, c.id, ctx.account.owner, row.id, row.revision, ctx.dataOwner, ctx.account.owner, c.id, row.id, ctx.dataOwner, ctx.account.owner]).run()).meta.changes);
      return response({ attempt: attemptView(ctx, await employerAttemptRow(ctx, v.id), true) }, 201);
    }
    if (path[0] === "attempts" && path.length === 2 && method === "PATCH") {
      const v = attemptActionSchema.parse(input);
      role(ctx, ["review", "cancel"].includes(v.action) ? "employer" : "candidate");
      const row = await employerAttemptRow(ctx, path[1]);
      let d = JSON.parse(row.data) as StoredEmployerAttempt;
      // A response lost after an accepted start/submit must not create a second attempt/result.
      if (v.action === "start" && d.state === "active") return response({ attempt: attemptView(ctx, row, true) });
      if (v.action === "submit" && ["submitted", "reviewed"].includes(d.state)) {
        if (d.expired || !v.answers || JSON.stringify(normalizeAnswers(d.snapshot.questions, v.answers)) === JSON.stringify(d.answers))
          return response({ attempt: attemptView(ctx, row, true) });
        throw new ServiceError(409, "Ответы уже отправлены и не могут быть изменены.");
      }
      if (v.action === "start") {
        if (d.state !== "invited" || Date.parse(d.dueAt) <= Date.now()) throw new ServiceError(409, "Приглашение закрыто или срок истёк.");
        d = { ...d, state: "active", startedAt: now(), answers: normalizeAnswers(d.snapshot.questions, {}) };
      } else if (v.action === "save" || v.action === "submit") {
        if (d.state !== "active" || Date.parse(d.dueAt) <= Date.now()) throw new ServiceError(409, "Тест уже закрыт. Обновите результат.");
        const answers = normalizeAnswers(d.snapshot.questions, v.answers ?? d.answers);
        d = v.action === "submit" ? finishAttempt(d, answers) : { ...d, answers };
      } else if (v.action === "decline" || v.action === "cancel") {
        if (!["invited", "active"].includes(d.state)) throw new ServiceError(409, "Завершённый тест нельзя отменить.");
        d = { ...d, state: v.action === "decline" ? "declined" : "cancelled" };
      } else {
        if (d.state !== "submitted" || !d.result?.pendingReview) throw new ServiceError(409, "Результат уже готов или ещё не отправлен кандидатом.");
        const textQuestions = d.snapshot.questions.filter((q) => q.kind === "text");
        if (v.reviews.length !== textQuestions.length || new Set(v.reviews.map((r) => r.questionId)).size !== v.reviews.length || v.reviews.some((r) => !textQuestions.some((q) => q.id === r.questionId && r.points <= q.points)))
          throw new ServiceError(422, "Оцените каждый открытый вопрос ровно один раз в пределах его веса.");
        d = { ...d, result: scoreEmployerTest(d.snapshot, d.answers, v.reviews, v.feedback), state: "reviewed", reviewedAt: now() };
      }
      const c = await candidate(ctx.dataOwner, row.candidate_id);
      if (!c?.privacy?.processing) throw new ServiceError(404, "Данные профиля недоступны.");
      const guard = candidateGuard(ctx, c.id, c.revision);
      await limit("employer-test-action:" + ctx.account.owner, 1200, 3600000);
      const deadlineBound = ["start", "save", "submit"].includes(v.action);
      // The database evaluates the deadline at the write, after every awaited check.
      // A request that entered before the deadline must not commit late answers.
      const mutation = await updateStatement(ctx, row, v.revision, { ...d, updatedAt: now() },
        guard.sql + (deadlineBound ? " AND julianday(json_extract(data,'$.dueAt'))>julianday('now')" : ""), guard.args).run();
      if (!mutation.meta.changes && deadlineBound && Date.parse(d.dueAt) <= Date.now()) {
        const latest = await employerAttemptRow(ctx, row.id);
        const final = attemptView(ctx, latest, true);
        if (final.expired) {
          if (v.action === "submit" && final.result) return response({ attempt: final });
          throw new ServiceError(409, "Срок теста истёк. Учтены только ранее сохранённые ответы; обновите результат.");
        }
      }
      changed(mutation.meta.changes);
      return response({ attempt: attemptView(ctx, await employerAttemptRow(ctx, row.id), true) });
    }
    throw new ServiceError(404, "Действие не найдено.");
  } catch (error) {
    if (error instanceof ZodError) return response({ error: error.issues[0]?.message ?? "Проверьте поля." }, 422);
    if (error instanceof ServiceError) return response({ error: error.message }, error.status);
    console.error("employer test request failed", error instanceof Error ? error.name : "Error");
    return response({ error: "Не удалось выполнить действие. Попробуйте обновить раздел." }, 500);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH };
