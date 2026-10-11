/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { getCurrentUser } from "@/app/session-auth";
import {
  resolveAccess,
  accessGuard,
  type AccessContext,
} from "@/lib/server/access";
import { database, candidate } from "@/lib/server/store";
import { readJson, response, ServiceError, limit } from "@/lib/server/security";
import {
  record,
  careerState,
  publicProofs,
  insertStatement,
  updateStatement,
  changed,
  role,
  ownCandidate,
  visibleCandidate,
  ownedRow,
  actorArgs,
  candidateGuard,
} from "@/lib/server/career-store";
import {
  briefSchema,
  controlsSchema,
  proofSchema,
  termsSchema,
  revision,
  text,
} from "@/lib/server/career-validation";
import { analyzeText, conditionIssues } from "@/lib/career-domain";
import { z, ZodError } from "zod";
import type {
  LabCase,
  Dialogue,
  Verification,
} from "@/lib/career-types";
import bankData from "@/lib/server/lab-bank.json";
export const dynamic = "force-dynamic";
type ServerCase = Omit<LabCase, "decisions"> & {
  decisions: (LabCase["decisions"][number] & {
    correctOptionId: string;
    explanation: string;
  })[];
};
const bank = bankData as ServerCase[];
const publicCase = (c: ServerCase) => ({
  ...c,
  decisions: c.decisions.map(({ correctOptionId, explanation, ...q }) => {
    void correctOptionId;
    void explanation;
    return q;
  }),
});
const now = () => new Date().toISOString();
const processing = (ctx: AccessContext, id: string) => ({
  sql: "AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND json_extract(data,'$.privacy.processing')=1)",
  args: [ctx.dataOwner, id],
});
async function offerRow(ctx: AccessContext, id: string) {
  const r = await database()
    .prepare("SELECT * FROM offers WHERE owner=? AND id=?")
    .bind(ctx.dataOwner, id)
    .first<{
      id: string;
      candidate_id: string;
      employer_id: string;
      status: string;
      data: string;
    }>();
  if (
    !r ||
    (ctx.account.role === "candidate"
      ? r.candidate_id !== ctx.account.candidate_id
      : r.employer_id !== (ctx.mode === "demo" ? "" : ctx.account.owner))
  )
    throw new ServiceError(404, "Предложение недоступно.");
  if (!(await candidate(ctx.dataOwner, r.candidate_id))?.privacy?.processing)
    throw new ServiceError(404, "Данные профиля недоступны.");
  return r;
}
async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError(401, "Войдите в Profectium.");
    const u = new URL(req.url),
      ctx = await resolveAccess(
        user.userId,
        u.pathname.startsWith("/api/live/"),
      );
    const { path } = await context.params;
    const method = req.method,
      db = database();
    if (path.length > 3) throw new ServiceError(404, "Раздел не найден.");
    if (method === "GET") {
      if (path.join("/") === "state") return response(await careerState(ctx));
      if (path[0] === "proofs" && path.length === 2)
        return response({ proofs: await publicProofs(ctx, path[1]) });
      if (path.join("/") === "lab")
        return response({
          cases: bank.map((c) => ({
            id: c.id,
            role: c.role,
            title: c.title,
            summary: c.summary,
            estimatedMinutes: c.estimatedMinutes,
          })),
          method:
            "Разбор инженерного кейса: выбор исправлений и объяснение. Код не исполняется.",
        });
      if (path[0] === "lab" && path.length === 2) {
        const c = bank.find((c) => c.id === path[1]);
        if (!c) throw new ServiceError(404, "Кейс не найден.");
        return response({ case: publicCase(c) });
      }
      throw new ServiceError(404, "Раздел не найден.");
    }
    if (!["POST", "PUT", "PATCH"].includes(method))
      throw new ServiceError(405, "Метод не поддерживается.");
    if (req.headers.get("origin") !== u.origin)
      throw new ServiceError(403, "Запрос должен поступить с этой страницы.");
    if (req.headers.get("x-session-revision") !== String(ctx.account.revision))
      throw new ServiceError(409, "Роль изменилась. Обновите страницу.");
    const input = await readJson(req);
    if (path.join("/") === "parse" && method === "POST") {
      const v = z
        .object({ kind: z.enum(["brief", "resume"]), text: text(12000, 20) })
        .strict()
        .parse(input);
      await limit("parse:" + ctx.account.owner, 30, 60000);
      return response(analyzeText(v.text, v.kind));
    }
    if (path.join("/") === "resume-import" && method === "POST") {
      const v = z
          .object({
            revision,
            skills: z.array(text(50, 1)).min(1,'Добавьте хотя бы один навык').max(20,'Допустимо до 20 навыков'),
            bio: text(2000, 20),
          })
          .strict()
          .parse(input),
        c = await ownCandidate(ctx);
      if (v.revision !== c.revision)
        throw new ServiceError(409, "Профиль изменился. Обновите раздел.");
      changed(
        (
          await db
            .prepare(
              `UPDATE candidates SET data=json_set(data,'$.skills',json(?),'$.bio',?),revision=revision+1 WHERE owner=? AND id=? AND revision=? AND json_extract(data,'$.privacy.processing')=1 AND ${accessGuard(ctx)}`,
            )
            .bind(
              JSON.stringify([...new Set(v.skills)]),
              v.bio,
              ctx.dataOwner,
              c.id,
              v.revision,
              ...actorArgs(ctx),
            )
            .run()
        ).meta.changes,
      );
      return response(await careerState(ctx));
    }
    if (
      path[0] === "briefs" &&
      path.length <= 2 &&
      ["POST", "PUT"].includes(method)
    ) {
      role(ctx, "employer");
      const {
        data,
        id,
        revision: rev,
      } = z
        .object({
          id: z.string().uuid(),
          revision: revision.optional(),
          data: briefSchema,
        })
        .strict()
        .parse(input);
      const old = await record(ctx, "brief", id);
      if (method === "POST" && old)
        throw new ServiceError(409, "Потребность уже существует.");
      if (method === "PUT" && (!old || path[1] !== id))
        throw new ServiceError(404, "Потребность не найдена.");
      const body = { ...data, updatedAt: now() };
      const r = old
        ? await updateStatement(ctx, old, revision.parse(rev), body).run()
        : await insertStatement(
            ctx,
            "brief",
            id,
            body,
            "",
            ctx.account.owner,
          ).run();
      changed(r.meta.changes);
      return response(await careerState(ctx), old ? 200 : 201);
    }
    if (path.join("/") === "controls" && method === "PUT") {
      const v = z
          .object({ revision, data: controlsSchema })
          .strict()
          .parse(input),
        c = await ownCandidate(ctx);
      if (v.revision !== c.revision)
        throw new ServiceError(409, "Профиль изменился. Обновите раздел.");
      changed(
        (
          await db
            .prepare(
              `UPDATE candidates SET data=json_set(data,'$.controls',json(?)),revision=revision+1 WHERE owner=? AND id=? AND revision=? AND json_extract(data,'$.privacy.processing')=1 AND ${accessGuard(ctx)}`,
            )
            .bind(
              JSON.stringify(v.data),
              ctx.dataOwner,
              c.id,
              v.revision,
              ...actorArgs(ctx),
            )
            .run()
        ).meta.changes,
      );
      return response(await careerState(ctx));
    }
    if (path[0] === "proofs" && method === "POST" && path.length === 1) {
      const v = z
          .object({ id: z.string().uuid(), data: proofSchema })
          .strict()
          .parse(input),
        c = await ownCandidate(ctx),
        g = candidateGuard(ctx, c.id, c.revision);
      const p = {
        ...v.data,
        kind: "self",
        source: "Самоописание кандидата",
        status: "claimed",
        synthetic: ctx.mode === "demo",
        limits:
          "Авторство, опыт и работоспособность артефакта автоматически не проверены.",
      };
      changed(
        (
          await insertStatement(
            ctx,
            "proof",
            v.id,
            p,
            c.id,
            "",
            g.sql,
            g.args,
          ).run()
        ).meta.changes,
      );
      return response(await careerState(ctx), 201);
    }
    if (path[0] === "proofs" && method === "PATCH" && path.length === 2) {
      const v = z
          .object({ revision, published: z.boolean() })
          .strict()
          .parse(input),
        c = await ownCandidate(ctx),
        r = await ownedRow(ctx, "proof", path[1]);
      if (r.candidate_id !== c.id)
        throw new ServiceError(404, "Запись недоступна.");
      const g = candidateGuard(ctx, c.id, c.revision);
      changed(
        (
          await updateStatement(
            ctx,
            r,
            v.revision,
            { ...JSON.parse(r.data), published: v.published },
            g.sql,
            g.args,
          ).run()
        ).meta.changes,
      );
      return response(await careerState(ctx));
    }
    if (path[0] === "lab" && path.length === 2 && method === "POST") {
      const v = z
        .object({
          id: z.string().uuid(),
          answers: z.record(text(100, 1), text(100, 1)),
          explanation: text(3000, 20),
          published: z.boolean(),
        })
        .strict()
        .parse(input);
      const c = await ownCandidate(ctx),
        task = bank.find((c) => c.id === path[1]);
      if (!task) throw new ServiceError(404, "Кейс не найден.");
      const old = await record(ctx, "lab", v.id);
      if (old) {
        const run = JSON.parse(old.data);
        if (
          old.candidate_id === c.id &&
          run.caseId === task.id &&
          run.explanation === v.explanation &&
          run.published === v.published &&
          Object.keys(run.answers).length === Object.keys(v.answers).length &&
          Object.keys(run.answers).every((k) => run.answers[k] === v.answers[k])
        )
          return response(await careerState(ctx));
        throw new ServiceError(
          409,
          "Идентификатор уже использован с другим содержимым.",
        );
      }
      if (
        Object.keys(v.answers).length !== task.decisions.length ||
        task.decisions.some(
          (q) => !q.options.some((o) => o.id === v.answers[q.id]),
        )
      )
        throw new ServiceError(422, "Выберите исправление для каждого этапа.");
      await limit("lab:" + ctx.account.owner, 30, 3600000);
      const feedback = task.decisions.map((q) => ({
        prompt: q.prompt,
        correct: q.correctOptionId === v.answers[q.id],
        explanation: q.explanation,
      }));
      const score = Math.round(
        (100 * feedback.filter((x) => x.correct).length) / feedback.length,
      );
      const artifact = task.decisions
        .map((q) => q.options.find((o) => o.id === v.answers[q.id])!.patch)
        .join("\n\n");
      const run = {
        caseId: task.id,
        caseTitle: task.title,
        answers: v.answers,
        explanation: v.explanation,
        published: v.published,
        artifact,
        score,
        feedback,
        executedCode: false,
      };
      const g = candidateGuard(ctx, c.id, c.revision),
        r = await db.batch([
          insertStatement(ctx, "lab", v.id, run, c.id, "", g.sql, g.args),
          insertStatement(
            ctx,
            "proof",
            "lab:" + v.id,
            {
              title: task.title,
              skill: task.skill,
              kind: "case",
              summary: `Разбор кейса: ${score}/100`,
              artifact,
              source: "Profectium · инженерный кейс",
              status: "evaluated",
              published: v.published,
              synthetic: ctx.mode === "demo",
              limits:
                "Проверен выбор исправлений по ключу. Код не исполнялся. Объяснение кандидата сохраняется без автоматической оценки. Грейд не изменяется.",
              score,
            },
            c.id,
            "",
            "AND EXISTS(SELECT 1 FROM career_records WHERE owner=? AND kind='lab' AND id=? AND candidate_id=?)",
            [ctx.dataOwner, v.id, c.id],
          ),
        ]);
      changed(r[0].meta.changes);
      return response(await careerState(ctx), 201);
    }
    if (path.join("/") === "requests" && method === "POST") {
      role(ctx, "employer");
      const v = z
        .object({
          id: z.string().uuid(),
          candidateId: text(80, 1),
          skill: text(80, 2),
          title: text(120, 3),
          criteria: text(2000, 20),
          estimatedMinutes: z.number().int().min(5).max(45),
          dueAt: z.string().datetime(),
        })
        .strict()
        .parse(input);
      if (
        Date.parse(v.dueAt) < Date.now() + 3600000 ||
        Date.parse(v.dueAt) > Date.now() + 30 * 86400000
      )
        throw new ServiceError(422, "Укажите срок от часа до 30 дней.");
      const c = await visibleCandidate(ctx, v.candidateId);
      await limit("verification:" + ctx.account.owner, 10, 3600000);
      const { id, candidateId, ...content } = v;
      const g = candidateGuard(ctx, c.id, c.revision!);
      changed(
        (
          await insertStatement(
            ctx,
            "request",
            id,
            {
              ...content,
              state: "requested",
              response: "",
              proofId: "",
              feedback: "",
              decision: "",
            },
            candidateId,
            ctx.account.owner,
            g.sql +
              " AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND json_extract(data,'$.privacy.publication')=1 AND json_extract(data,'$.available')=1)",
            [...g.args, ctx.dataOwner, c.id],
          ).run()
        ).meta.changes,
      );
      return response(await careerState(ctx), 201);
    }
    if (path[0] === "requests" && path.length === 2 && method === "PATCH") {
      const v = z
          .object({
            revision,
            action: z.enum(["submit", "decline", "review", "cancel"]),
            response: text(2000).optional(),
            proofId: text(100).optional(),
            feedback: text(2000).optional(),
            decision: z.enum(["confirmed", "more-evidence"]).optional(),
          })
          .strict()
          .parse(input),
        r = await ownedRow(ctx, "request", path[1]),
        data = JSON.parse(r.data) as Verification;
      if (["submit", "decline"].includes(v.action)) {
        role(ctx, "candidate");
        if (
          !["requested", "submitted"].includes(data.state) ||
          Date.parse(data.dueAt) < Date.now()
        )
          throw new ServiceError(409, "Запрос закрыт или истёк.");
        if (v.action === "submit") {
          if ((v.response ?? "").length < 20)
            throw new ServiceError(
              422,
              "Опишите подтверждение минимум в 20 символах.",
            );
          let attachment = "";
          if (v.proofId) {
            const proofs = await publicProofs(ctx, r.candidate_id),
              p = proofs.find((p) => p.id === v.proofId);
            if (!p) throw new ServiceError(422, "Доказательство недоступно.");
            attachment = `\n\nПриложено кандидатом: ${p.title}\n${p.summary}\n${p.artifact}`;
          }
          Object.assign(data, {
            state: "submitted",
            response: v.response + attachment,
            proofId: v.proofId ?? "",
          });
        } else data.state = "declined";
      } else {
        role(ctx, "employer");
        if (v.action === "review") {
          if (
            data.state !== "submitted" ||
            (v.feedback ?? "").length < 20 ||
            !v.decision
          )
            throw new ServiceError(
              422,
              "Нужен ответ кандидата и предметная обратная связь.",
            );
          Object.assign(data, {
            state: "reviewed",
            feedback: v.feedback,
            decision: v.decision,
          });
        } else {
          if (!["requested", "submitted"].includes(data.state))
            throw new ServiceError(409, "Запрос уже закрыт.");
          data.state = "cancelled";
        }
      }
      const g = processing(ctx, r.candidate_id);
      changed(
        (await updateStatement(ctx, r, v.revision, data, g.sql, g.args).run())
          .meta.changes,
      );
      return response(await careerState(ctx));
    }
    if (path.join("/") === "grants" && method === "POST") {
      const v = z
          .object({
            id: z.string().uuid(),
            employerId: text(150, 1),
            fields: z
              .array(z.enum(["identity", "artifacts"]))
              .min(1)
              .max(2),
            expiresInDays: z.number().int().min(1).max(30),
          })
          .strict()
          .parse(input),
        c = await ownCandidate(ctx);
      /*
       * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
       * Все права сохранены.
       *
       * Автор: Криницин Вячеслав Александрович
       */
      const recipient = (await careerState(ctx)).recipients.find(
        (r) => r.id === v.employerId,
      );
      if (!recipient) throw new ServiceError(422, "Получатель недоступен.");
      const g = candidateGuard(ctx, c.id, c.revision);
      changed(
        (
          await insertStatement(
            ctx,
            "grant",
            v.id,
            {
              fields: [...new Set(v.fields)],
              expiresAt: new Date(
                Date.now() + v.expiresInDays * 86400000,
              ).toISOString(),
              revoked: false,
              recipientName: recipient.name,
            },
            c.id,
            recipient.id,
            g.sql,
            g.args,
          ).run()
        ).meta.changes,
      );
      return response(await careerState(ctx), 201);
    }
    if (path[0] === "grants" && path.length === 2 && method === "PATCH") {
      role(ctx, "candidate");
      const v = z.object({ revision }).strict().parse(input),
        r = await ownedRow(ctx, "grant", path[1]);
      changed(
        (
          await updateStatement(ctx, r, v.revision, {
            ...JSON.parse(r.data),
            revoked: true,
          }).run()
        ).meta.changes,
      );
      return response(await careerState(ctx));
    }
    if (path[0] === "proof-view" && path.length === 2 && method === "POST") {
      role(ctx, "employer");
      const c = await visibleCandidate(ctx, path[1]);
      const id =
        c.id +
        ":" +
        ctx.account.owner +
        ":" +
        new Date().toISOString().slice(0, 10);
      await insertStatement(
        ctx,
        "view",
        id,
        { at: now() },
        c.id,
        ctx.account.owner,
      ).run();
      return response({ recorded: true });
    }
    if (path[0] === "dialogues" && path.length === 2 && method === "POST") {
      const v = z.object({ terms: termsSchema }).strict().parse(input);
      role(ctx, "employer");
      const o = await offerRow(ctx, path[1]);
      if (o.status !== "pending")
        throw new ServiceError(409, "Предложение уже закрыто.");
      const existing = await record(ctx, "dialogue", o.id);
      if (existing)
        throw new ServiceError(409, "Условия уже открыты. Обновите раздел.");
      const c = (await candidate(ctx.dataOwner, o.candidate_id))!;
      const problems = conditionIssues(c.controls?.rules, v.terms);
      if (c.controls?.rules.strict && problems.length)
        throw new ServiceError(422, problems.join(". "));
      const g = candidateGuard(ctx, c.id, c.revision);
      const terms = {
        offerId: o.id,
        terms: v.terms,
        turn: "candidate",
        agreed: false,
        versions: [
          {
            version: 1,
            by: "employer",
            at: now(),
            terms: v.terms,
            note: "Условия раскрыты работодателем",
          },
        ],
        events: [],
      };
      changed(
        (
          await insertStatement(
            ctx,
            "dialogue",
            o.id,
            terms,
            o.candidate_id,
            ctx.account.owner,
            g.sql +
              " AND EXISTS(SELECT 1 FROM offers WHERE owner=? AND id=? AND status='pending')",
            [...g.args, ctx.dataOwner, o.id],
          ).run()
        ).meta.changes,
      );
      return response(await careerState(ctx), 201);
    }
    if (path[0] === "dialogues" && path.length === 2 && method === "PATCH")
      return await updateDialogue(ctx, path[1], input);
    if (path.join("/") === "sandbox" && method === "POST") {
      if (ctx.mode !== "demo")
        throw new ServiceError(403, "Песочница доступна только в демо.");
      role(ctx, "employer");
      const { scenario } = z
        .object({
          scenario: z.enum(["success", "timeout", "partial", "changed"]),
        })
        .strict()
        .parse(input);
      const scenarios = {
        success: {
          status: "available",
          records: 2,
          message: "Две синтетические записи прошли проверку структуры.",
        },
        timeout: {
          status: "unavailable",
          records: 0,
          message:
            "Источник не ответил в пределах демонстрационного таймаута. Сохранённые сведения не заменяются.",
        },
        partial: {
          status: "rejected",
          records: 0,
          message:
            "В записи отсутствует дисциплина. Неполные данные не приняты.",
        },
        changed: {
          status: "review",
          records: 1,
          message:
            "Место изменилось с 3 на 2. Изменение требует сверки; коммерческий грейд не пересчитан.",
        },
      };
      return response({
        scenario,
        ...scenarios[scenario],
        synthetic: true,
        networkRequest: false,
        imported: false,
        at: now(),
      });
    }
    throw new ServiceError(404, "Действие не найдено.");
  } catch (e) {
    if (e instanceof ZodError)
      return response(
        { error: e.issues[0]?.message ?? "Проверьте поля." },
        422,
      );
    if (e instanceof ServiceError)
      return response({ error: e.message }, e.status);
    console.error(
      "career request failed",
      e instanceof Error ? e.name : "Error",
    );
    return response(
      { error: "Не удалось выполнить действие. Попробуйте обновить раздел." },
      500,
    );
  }
}
async function updateDialogue(ctx: AccessContext, id: string, input: unknown) {
  const v = z
    .object({
      revision,
      action: z.enum(["propose", "agree", "message", "step", "feedback"]),
      terms: termsSchema.optional(),
      note: text(2000).default(""),
      dueAt: z.string().datetime().optional(),
    })
    .strict()
    .parse(input);
  const r = await ownedRow(ctx, "dialogue", id),
    o = await offerRow(ctx, id),
    d = JSON.parse(r.data) as Dialogue,
    by = ctx.account.role;
  if (d.versions.length >= 30 || d.events.length >= 100)
    throw new ServiceError(409, "Достигнут лимит истории этого предложения.");
  if (["propose", "agree"].includes(v.action) && o.status !== "pending")
    throw new ServiceError(
      409,
      "Условия уже закрытого предложения не меняются.",
    );
  const c = (await candidate(ctx.dataOwner, o.candidate_id))!,
    g = candidateGuard(ctx, c.id, c.revision),
    nonce = crypto.randomUUID();
  if (v.action === "propose") {
    if (d.turn !== by || !v.terms || v.note.length < 10)
      throw new ServiceError(
        422,
        "Дождитесь своей очереди и поясните изменение условий.",
      );
    if (by === "employer" && c.controls?.rules.strict) {
      const issues = conditionIssues(c.controls.rules, v.terms);
      if (issues.length) throw new ServiceError(422, issues.join(". "));
    }
    d.terms = v.terms;
    d.agreed = false;
    d.turn = by === "candidate" ? "employer" : "candidate";
    d.versions.push({
      version: d.versions.length + 1,
      by,
      at: now(),
      terms: v.terms,
      note: v.note,
    });
  } else if (v.action === "agree") {
    if (d.turn !== by)
      throw new ServiceError(
        409,
        "Нельзя подтвердить собственное предложение.",
      );
    if (by === "employer") {
      if (c.controls?.rules.strict) {
        const issues = conditionIssues(c.controls.rules, d.terms);
        if (issues.length) throw new ServiceError(422, issues.join(". "));
      }
      d.turn = "candidate";
      d.versions.push({
        version: d.versions.length + 1,
        by,
        at: now(),
        terms: d.terms,
        note: "Работодатель согласовал встречные условия. Ожидается окончательный ответ кандидата.",
      });
    } else {
      d.agreed = true;
      d.events.push({
        id: nonce,
        by,
        at: now(),
        kind: "agreement",
        text: "Кандидат принял согласованные условия.",
      });
    }
  } else {
    if (v.note.length < 10)
      throw new ServiceError(422, "Добавьте содержательное сообщение.");
    if (v.action === "feedback") role(ctx, "employer");
    if (v.action === "step" && (!v.dueAt || Date.parse(v.dueAt) < Date.now()))
      throw new ServiceError(422, "Укажите будущий срок следующего шага.");
    d.events.push({
      id: nonce,
      by,
      at: now(),
      kind: v.action,
      text: v.note,
      ...(v.action === "step" ? { dueAt: v.dueAt } : {}),
    });
  }
  const changedData = { ...d, mutationNonce: nonce };
  const statements = [
    updateStatement(
      ctx,
      r,
      v.revision,
      changedData,
      g.sql +
        (v.action === "agree" || v.action === "propose"
          ? " AND EXISTS(SELECT 1 FROM offers WHERE owner=? AND id=? AND status='pending')"
          : ""),
      [
        ...g.args,
        ...(["agree", "propose"].includes(v.action) ? [ctx.dataOwner, id] : []),
      ],
    ),
  ];
  if (v.action === "agree" && by === "candidate") {
    const offer = JSON.parse(o.data);
    Object.assign(offer, {
      salaryMin: d.terms.salaryMin,
      salaryMax: d.terms.salaryMax,
      workFormat: d.terms.workFormat,
      coreHours: d.terms.coreHours,
      onCall: d.terms.onCall,
    });
    statements.push(
      database()
        .prepare(
          "UPDATE offers SET data=?,status='accepted',updated_at=? WHERE owner=? AND id=? AND candidate_id=? AND status='pending' AND EXISTS(SELECT 1 FROM career_records WHERE owner=? AND kind='dialogue' AND id=? AND json_extract(data,'$.mutationNonce')=?)",
        )
        .bind(
          JSON.stringify(offer),
          now(),
          ctx.dataOwner,
          id,
          ctx.account.candidate_id,
          ctx.dataOwner,
          id,
          nonce,
        ),
    );
  }
  const result = await database().batch(statements);
  changed(result[0].meta.changes);
  if (result.length > 1) changed(result[1].meta.changes);
  return response(await careerState(ctx));
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH };
