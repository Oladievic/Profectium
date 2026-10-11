/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { resolveAccess, accessGuard } from "@/lib/server/access";
import { ServiceError } from "@/lib/server/security";
import { conditionIssues } from '@/lib/career-domain';
import { getCurrentUser } from "@/app/session-auth";
import {
  allState,
  database,
  initialize,
  candidate,
  job,
  company,
  assessmentHistory,
  finalizeExpiredAssessments,
} from "@/lib/server/store";
import {
  jobSchema,
  profileSchema,
  offerSchema,
  companySchema,
} from "@/lib/server/validation";
import { fspProvider } from "@/lib/server/fsp";
import {
  filterCandidates,
  defaultFiltersPlaceholder,
} from "@/lib/server/api-helpers";
import { z, ZodError } from "zod";
import {
  roles,
  grades,
  type Job,
  type Offer,
  type Assessment,
  type Candidate,
  type Qualification,
} from "@/lib/types";
import {
  createAssessment,
  scoreAssessment,
  eligibility,
  COOLDOWN_DAYS,
} from "@/lib/server/assessment-engine";

export const dynamic = "force-dynamic";
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function body(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Требуется application/json");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Пустой запрос");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new ApiError(413, "Запрос слишком большой");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let i = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, i);
    i += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "Некорректный JSON");
  }
}
async function digest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await context.params).path;
    const url = new URL(req.url);
    const method = req.method;
    if (method === "GET" && path.join("/") === "health")
      return json({
        status: "ok",
        mode: "demo",
        fsp: "mock-fsp",
        version: "0.3.0",
      });
    const user = await getCurrentUser();
    if (!user)
      throw new ApiError(401, "Войдите, чтобы открыть демопространство");
    const ctx = await resolveAccess(
      user.userId,
      url.pathname.startsWith("/api/live/"),
    );
    const { dataOwner: owner, account } = ctx,
      actor = account.owner,
      db = database(),
      employerId = ctx.mode === "live" ? actor : "";
    const guard = accessGuard(ctx);
    const snapshot = async () =>
      allState(
        ctx.mode === "demo"
          ? { ...ctx, account: await initialize(owner) }
          : ctx,
      );
    if (ctx.mode === "live" && ["session", "onboarding"].includes(path[0]))
      throw new ApiError(
        403,
        "Рабочая роль закреплена за аккаунтом; демопереключение здесь недоступно.",
      );
    const mutation = !["GET", "HEAD"].includes(method);
    if (mutation) {
      if (req.headers.get("origin") !== url.origin)
        throw new ApiError(403, "Запрос должен поступить с этой страницы");
      const revision = req.headers.get("x-session-revision");
      if (revision === null || Number(revision) !== account.revision)
        throw new ApiError(
          409,
          "Роль изменилась в другой вкладке. Обновите страницу",
        );
    }
    const expected = account.revision;
    const assertRole = (role: string) => {
      if (account.role !== role)
        throw new ApiError(403, "Действие недоступно для выбранной роли");
    };
    const changed = (n: number) => {
      if (!n)
        throw new ApiError(
          409,
          "Данные изменились. Обновите страницу и повторите действие",
        );
    };
    if (path[0] === "notes" && path[1] && method === "PUT") {
      assertRole("employer");
      if (!(await snapshot()).candidates.some((c) => c.id === path[1]))
        throw new ApiError(404, "Профиль недоступен");
      const input = z
        .object({
          stage: z.enum(["shortlist", "screening", "interview", "decision"]),
          text: z.string().trim().max(2000),
          revision: z.number().int().min(0),
        })
        .strict()
        .parse(await body(req));
      const value = JSON.stringify({
        stage: input.stage,
        text: input.text,
        updatedAt: new Date().toISOString(),
      });
      const r = await db
        .prepare(
          `INSERT INTO hiring_notes(owner,candidate_id,data,revision) SELECT ?,?,?,1 WHERE ${guard} AND (?=0 OR EXISTS(SELECT 1 FROM hiring_notes WHERE owner=? AND candidate_id=? AND revision=?)) ON CONFLICT(owner,candidate_id) DO UPDATE SET data=excluded.data,revision=hiring_notes.revision+1 WHERE hiring_notes.revision=?`,
        )
        .bind(
          actor,
          path[1],
          value,
          actor,
          expected,
          "employer",
          input.revision,
          actor,
          path[1],
          input.revision,
          input.revision,
        )
        .run();
      changed(r.meta.changes);
      return json(await snapshot());
    }
    if (path[0] === "learning" && method === "PATCH") {
      assertRole("candidate");
      const input = z
        .object({ completed: z.array(z.string().min(1).max(120)).max(24) })
        .strict()
        .parse(await body(req));
      const c = await candidate(owner, account.candidate_id);
      if (!c?.privacy?.processing)
        throw new ApiError(403, "Сначала включите обработку профиля");
      const r = await db
        .prepare(
          `UPDATE candidates SET data=json_set(data,'$.learningCompleted',json(?)),revision=revision+1 WHERE owner=? AND id=? AND revision=? AND ${guard}`,
        )
        .bind(
          JSON.stringify([...new Set(input.completed)]),
          owner,
          c.id,
          c.revision,
          actor,
          expected,
          "candidate",
        )
        .run();
      changed(r.meta.changes);
      return json(await snapshot());
    }
    if (
      path[0] === "assessments" &&
      path[1] &&
      path[2] === "draft" &&
      path.length === 3 &&
      method === "PUT"
    ) {
      assertRole("candidate");
      const input = z
        .object({ answers: z.record(z.string().uuid(), z.string().uuid()), revision: z.number().int().min(0).default(0) })
        .strict()
        .parse(await body(req));
      const row = await db
        .prepare(
          "SELECT data FROM assessments WHERE owner=? AND id=? AND candidate_id=? AND status='active'",
        )
        .bind(owner, path[1], account.candidate_id)
        .first<{ data: string }>();
      if (!row) throw new ApiError(404, "Активная попытка не найдена");
      const attempt: Assessment = JSON.parse(row.data);
      if ((attempt.draftRevision ?? 0) !== input.revision)
        throw new ApiError(409, "Черновик изменён в другой вкладке. Ваши ответы не перезаписаны. Сравните сохранённую версию перед повторной отправкой.");
      if (
        Object.entries(input.answers).some(
          ([id, value]) =>
            !attempt.questions
              .find((q) => q.id === id)
              ?.options.some((o) => o.id === value),
        )
      )
        throw new ApiError(422, "Некорректные ответы");
      if (Date.now() >= Date.parse(attempt.expiresAt)) {
        await finalizeExpiredAssessments(owner, account.candidate_id);
        throw new ApiError(409, "Время теста истекло. Получите результат сохранённых ответов.");
      }
      const r = await db
        .prepare(
          `UPDATE assessments SET data=json_set(data,'$.draftAnswers',json(?),'$.draftRevision',?) WHERE owner=? AND id=? AND candidate_id=? AND status='active' AND coalesce(json_extract(data,'$.draftRevision'),0)=? AND julianday(json_extract(data,'$.expiresAt'))>julianday('now') AND ${guard} AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND json_extract(data,'$.privacy.processing')=1)`,
        )
        .bind(
          JSON.stringify(input.answers),
          input.revision + 1,
          owner,
          path[1],
          account.candidate_id,
          input.revision,
          actor,
          expected,
          "candidate",
          owner,
          account.candidate_id,
        )
        .run();
      if (!r.meta.changes && Date.now() >= Date.parse(attempt.expiresAt))
        await finalizeExpiredAssessments(owner, account.candidate_id);
      changed(r.meta.changes);
      return json(await snapshot());
    }
    if (method === "GET") {
      if (path[0] === "state") return json(await snapshot());
      if (path[0] === "candidates") {
        assertRole("employer");
        if (path[1]) {
          const c = (await snapshot()).candidates.find((c) => c.id === path[1]);
          if (!c) throw new ApiError(404, "Профиль не найден");
          return json(c);
        }
        const state = await snapshot();
        const filters = {
          ...defaultFiltersPlaceholder,
          query: url.searchParams.get("q") ?? "",
          role: url.searchParams.get("role") ?? "all",
          hasAchievements: url.searchParams.get("achievements") === "true",
        };
        return json({
          items: filterCandidates(state.candidates, filters, state.jobs),
          source: ctx.mode==="demo"?"synthetic":"member-profiles",
        });
      }
      if (path[0] === "jobs") return json({ items: (await snapshot()).jobs });
      if (path[0] === "offers")
        return json({ items: (await snapshot()).offers });
      if (path[0] === "fsp" && path[1] === "participants" && path[2]) {
        if (account.role === "candidate" && account.candidate_id !== path[2])
          throw new ApiError(403, "Чужие профили недоступны");
        const c = (await snapshot()).candidates.find((c) => c.id === path[2]);
        if (!c) throw new ApiError(404, "Профиль недоступен");
        return json({
          participantId: path[2],
          source: "mock-fsp",
          synthetic: true,
          achievements: c.achievements,
        });
      }
    }
    if (path[0] === "company" && method === "PATCH") {
      assertRole("employer");
      const input = companySchema.parse(await body(req));
      const r = await db
        .prepare(`UPDATE companies SET data=? WHERE owner=? AND ${guard}`)
        .bind(JSON.stringify(input), actor, actor, expected, "employer")
        .run();
      changed(r.meta.changes);
      return json(await snapshot());
    }
    if (path[0] === "onboarding" && method === "POST") {
      const input = z
        .object({
          fullName: z.string().trim().min(3).max(80),
          contact: z.string().trim().email().max(150),
          processing: z.literal(true),
          publication: z.boolean(),
        })
        .strict()
        .parse(await body(req));
      const id = "demo-new-candidate";
      const c: Candidate = {
        id,
        fullName: input.fullName,
        initials: input.fullName
          .split(/\s+/)
          .slice(0, 2)
          .map((x) => x[0])
          .join(""),
        role: "Frontend",
        grade: "Junior",
        city: "Москва",
        workFormat: "Удалённо",
        salaryMin: 80000,
        salaryMax: 120000,
        yearsExperience: 0,
        skills: ["JavaScript"],
        bio: "Новый профиль. Расскажите о своём опыте и проектах.",
        achievements: [],
        available: true,
        contact: input.contact,
        softSkills: [],
        fspId: "",
        privacy: {
          processing: true,
          publication: input.publication,
          showAchievements: true,
          consentAt: new Date().toISOString(),
        },
      };
      if (await candidate(owner, id))
        throw new ApiError(
          409,
          "Новый профиль уже создан. Выберите его в деморолях",
        );
      const created = await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO candidates(owner,id,data,revision) SELECT ?,?,?,0 WHERE ${guard}`,
          )
          .bind(owner, id, JSON.stringify(c), actor, expected, account.role),
        db
          .prepare(
            "UPDATE demo_accounts SET role='candidate',candidate_id=?,revision=revision+1 WHERE owner=? AND revision=? AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=?)",
          )
          .bind(id, actor, expected, owner, id),
      ]);
      changed(created[0].meta.changes);
      const current = await initialize(owner);
      if (current.candidate_id !== id || current.role !== "candidate")
        throw new ApiError(409, "Роль изменилась. Повторите действие");
      return json(await snapshot(), 201);
    }
    if (path[0] === "assessments" && method === "POST" && path.length === 1) {
      assertRole("candidate");
      const input = z
        .object({
          role: z.enum(roles),
          grade: z.enum(grades),
          industry: z.string().trim().min(2).max(80),
          motivation: z.string().trim().min(10).max(500),
          jobId: z.string().max(80).optional(),
        })
        .strict()
        .parse(await body(req));
      const c = await candidate(owner, account.candidate_id);
      if (!c?.privacy?.processing)
        throw new ApiError(
          422,
          "Сначала заполните профиль и согласие на обработку данных",
        );
      const now = Date.now();
      const history = await assessmentHistory(owner, c.id);
      if (history.some((a) => a.status === "active"))
        throw new ApiError(409, "У вас уже есть незавершённая попытка");
      const reason = eligibility(c, input.role, input.grade, history, now);
      if (reason) throw new ApiError(409, reason);
      const vacancy = input.jobId ? await job(owner, input.jobId) : null;
      if (
        input.jobId &&
        (!vacancy ||
          vacancy.role !== input.role ||
          vacancy.grade !== input.grade)
      )
        throw new ApiError(
          422,
          "Специализация и уровень должны соответствовать выбранной потребности",
        );
      const { assessment, keys } = createAssessment(
        input.role,
        input.grade,
        input.industry,
        input.motivation,
        vacancy ?? undefined,
        now,
      );
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO assessments(owner,id,candidate_id,role,grade,data,answer_key,status,created_at) SELECT ?,?,?,?,?,?,?,'active',? WHERE ${guard} AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND revision=? AND json_extract(data,'$.privacy.processing')=1) AND NOT EXISTS(SELECT 1 FROM assessments WHERE owner=? AND candidate_id=? AND role=? AND grade=? AND created_at>?)`,
        )
        .bind(
          owner,
          assessment.id,
          c.id,
          input.role,
          input.grade,
          JSON.stringify(assessment),
          JSON.stringify(keys),
          assessment.createdAt,
          actor,
          expected,
          "candidate",
          owner,
          c.id,
          c.revision,
          owner,
          c.id,
          input.role,
          input.grade,
          new Date(now - 86400000).toISOString(),
        )
        .run();
      changed(r.meta.changes);
      return json(await snapshot(), 201);
    }
    if (path[0] === "assessments" && path[1] && path.length === 2 && method === "POST") {
      assertRole("candidate");
      const input = z
        .object({ answers: z.record(z.string().uuid(), z.string().uuid()), revision: z.number().int().min(0).default(0) })
        .strict()
        .parse(await body(req));
      await finalizeExpiredAssessments(owner, account.candidate_id);
      const row = await db
        .prepare(
          "SELECT data,answer_key,status FROM assessments WHERE owner=? AND id=? AND candidate_id=?",
        )
        .bind(owner, path[1], account.candidate_id)
        .first<{
          data: string;
          answer_key: string;
          status: Assessment["status"];
        }>();
      if (!row) throw new ApiError(404, "Попытка не найдена");
      const attempt: Assessment = {
        ...JSON.parse(row.data),
        status: row.status,
      };
      if (attempt.status !== "active") {
        if (attempt.status === "expired") return json(await snapshot());
        if (
          attempt.answers &&
          JSON.stringify(Object.entries(attempt.answers).sort()) ===
            JSON.stringify(Object.entries(input.answers).sort())
        )
          return json(await snapshot());
        throw new ApiError(
          409,
          "Попытка завершена, результат нельзя перезаписать",
        );
      }
      /*
       * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
       * Все права сохранены.
       *
       * Автор: Криницин Вячеслав Александрович
       */
      if ((attempt.draftRevision ?? 0) !== input.revision)
        throw new ApiError(409, "Черновик изменён в другой вкладке. Ваши ответы сохранены в этой вкладке; сравните версии перед завершением теста.");
      if (
        Object.keys(input.answers).length !== attempt.questions.length ||
        attempt.questions.some(
          (q) => !q.options.some((o) => o.id === input.answers[q.id]),
        )
      )
        throw new ApiError(
          422,
          "Ответьте на все вопросы корректными вариантами",
        );
      const now = Date.now();
      if (now >= Date.parse(attempt.expiresAt)) {
        await finalizeExpiredAssessments(owner, account.candidate_id, now);
        return json(await snapshot());
      }
      const
        result = scoreAssessment(
          attempt,
          JSON.parse(row.answer_key),
          input.answers,
          now,
        ),
        nonce = crypto.randomUUID();
      const qualification: Qualification = {
        role: result.role,
        grade: result.grade,
        score: result.score!,
        passedAt: result.completedAt!,
        nextChangeAt: new Date(now + COOLDOWN_DAYS * 86400000).toISOString(),
        attemptId: result.id,
        synthetic: false,
      };
      const c = await candidate(owner, account.candidate_id);
      if (
        c?.qualification?.role === qualification.role &&
        c.qualification.grade === qualification.grade
      )
        qualification.nextChangeAt = c.qualification.nextChangeAt;
      if (!c?.privacy?.processing)
        throw new ApiError(409, "Обработка профиля отключена");
      if (Date.now() >= Date.parse(attempt.expiresAt)) {
        await finalizeExpiredAssessments(owner, account.candidate_id);
        return json(await snapshot());
      }
      const cooldownBlocked =
        c.qualification &&
        (c.qualification.role !== result.role ||
          c.qualification.grade !== result.grade) &&
        Date.parse(c.qualification.nextChangeAt) > now;
      if (cooldownBlocked)
        throw new ApiError(
          409,
          "Категория изменилась во время попытки. Обновите страницу",
        );
      const statements = [
        db
          .prepare(
            `UPDATE assessments SET data=?,status=? WHERE owner=? AND id=? AND status='active' AND candidate_id=? AND coalesce(json_extract(data,'$.draftRevision'),0)=? AND julianday(json_extract(data,'$.expiresAt'))>julianday('now') AND ${guard} AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND revision=? AND json_extract(data,'$.privacy.processing')=1)`,
          )
          .bind(
            JSON.stringify({ ...result, resultNonce: nonce }),
            result.status,
            owner,
            result.id,
            account.candidate_id,
            input.revision,
            actor,
            expected,
            "candidate",
            owner,
            c.id,
            c.revision,
          ),
      ];
      if (result.status === "passed")
        statements.push(
          db
            .prepare(
              `UPDATE candidates SET data=json_set(data,'$.qualification',json(?)),revision=revision+1 WHERE owner=? AND id=? AND EXISTS(SELECT 1 FROM assessments WHERE owner=? AND id=? AND status='passed' AND json_extract(data,'$.resultNonce')=?) AND ${guard}`,
            )
            .bind(
              JSON.stringify(qualification),
              owner,
              account.candidate_id,
              owner,
              result.id,
              nonce,
              actor,
              expected,
              "candidate",
            ),
        );
      const results = await db.batch(statements);
      if (!results[0].meta.changes && Date.now() >= Date.parse(attempt.expiresAt)) {
        await finalizeExpiredAssessments(owner, account.candidate_id);
        return json(await snapshot());
      }
      changed(results[0].meta.changes);
      return json(await snapshot());
    }
    if (path[0] === "session" && method === "POST") {
      const input = z
        .object({
          role: z.enum(["employer", "candidate"]),
          candidateId: z.string().max(80),
        })
        .strict()
        .parse(await body(req));
      if (!(await candidate(owner, input.candidateId)))
        throw new ApiError(404, "Демопрофиль не найден");
      const result = await db
        .prepare(
          "UPDATE demo_accounts SET role=?,candidate_id=?,revision=revision+1 WHERE owner=? AND revision=?",
        )
        .bind(input.role, input.candidateId, actor, expected)
        .run();
      changed(result.meta.changes);
      return json(await snapshot());
    }
    if (
      path[0] === "favorites" &&
      path[1] &&
      ["PUT", "DELETE"].includes(method)
    ) {
      assertRole("employer");
      if (!(await snapshot()).candidates.some((c) => c.id === path[1]))
        throw new ApiError(404, "Профиль не найден");
      const result =
        method === "PUT"
          ? await db
              .prepare(
                `INSERT OR IGNORE INTO favorites(owner,candidate_id) SELECT ?,? WHERE ${guard}`,
              )
              .bind(actor, path[1], actor, expected, "employer")
              .run()
          : await db
              .prepare(
                `DELETE FROM favorites WHERE owner=? AND candidate_id=? AND ${guard}`,
              )
              .bind(actor, path[1], actor, expected, "employer")
              .run();
      if (!result.meta.changes) {
        const current = await db
          .prepare(`SELECT 1 WHERE ${guard}`)
          .bind(actor, expected, "employer")
          .first();
        if (!current)
          throw new ApiError(
            409,
            "Роль изменилась в другой вкладке. Обновите страницу",
          );
      }
      return json(await snapshot());
    }
    if (path[0] === "jobs" && method === "POST") {
      assertRole("employer");
      const input = jobSchema.parse(await body(req));
      const key = z.string().uuid().parse(req.headers.get("idempotency-key"));
      const hash = await digest(input);
      const organization = await company(actor);
      const record: Job = {
        ...input,
        company: organization.name,
        employerId,
        id: key,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      await db
        .prepare(
          `INSERT OR IGNORE INTO jobs(owner,id,employer_id,data,digest) SELECT ?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          owner,
          key,
          employerId,
          JSON.stringify(record),
          hash,
          actor,
          expected,
          "employer",
        )
        .run();
      const saved = await db
        .prepare(
          "SELECT digest FROM jobs WHERE owner=? AND id=? AND employer_id=?",
        )
        .bind(owner, key, employerId)
        .first<{ digest: string }>();
      if (!saved || saved.digest !== hash)
        throw new ApiError(409, "Конфликт сохранения вакансии");
      return json(await snapshot(), 201);
    }
    if (path[0] === "jobs" && path[1] && method === "PATCH") {
      assertRole("employer");
      const input = z
        .object({ status: z.enum(["active", "archived"]) })
        .strict()
        .parse(await body(req));
      const current = await job(owner, path[1]);
      if (!current) throw new ApiError(404, "Вакансия не найдена");
      const r = await db
        .prepare(
          `UPDATE jobs SET data=? WHERE owner=? AND id=? AND employer_id=? AND ${guard}`,
        )
        .bind(
          JSON.stringify({ ...current, status: input.status }),
          owner,
          path[1],
          employerId,
          actor,
          expected,
          "employer",
        )
        .run();
      changed(r.meta.changes);
      return json(await snapshot());
    }
    if (path[0] === "offers" && method === "POST") {
      assertRole("employer");
      const input = offerSchema.parse(await body(req));
      const key = z.string().uuid().parse(req.headers.get("idempotency-key"));
      const hash = await digest(input);
      const prior = await db
        .prepare(
          "SELECT digest FROM offers WHERE owner=? AND id=? AND employer_id=?",
        )
        .bind(owner, key, employerId)
        .first<{ digest: string }>();
      if (prior) {
        if (prior.digest !== hash)
          throw new ApiError(409, "Ключ запроса уже использован");
        return json(await snapshot());
      }
      const c = (await snapshot()).candidates.find(
          (c) => c.id === input.candidateId,
        ),
        j = input.jobId ? await job(owner, input.jobId) : null;
      if (!c || (input.jobId && !j))
        throw new ApiError(404, "Профиль или вакансия не найдены");
      if (ctx.mode === "live" && j && j.employerId !== employerId)
        throw new ApiError(
          403,
          "Можно приглашать только на потребности своей компании",
        );
      if (!j && !input.jobTitle)
        throw new ApiError(422, "Укажите название предложения");
      const organization = await company(actor);
      if (!organization.name)
        throw new ApiError(422, "Заполните профиль компании");
      if (c.available === false || (j && j.status !== "active"))
        throw new ApiError(409, "Кандидат или вакансия сейчас недоступны");
      const rules = c.incomingRules;
      if (rules?.strict) {
        const issues = conditionIssues(rules, input);
        if (issues.length) throw new ApiError(422, issues.join('. '));
      }
      const now = new Date().toISOString();
      const offer: Offer = {
        ...input,
        employerId,
        id: key,
        jobTitle: j?.title ?? input.jobTitle!,
        company: organization.name,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO offers(owner,id,employer_id,candidate_id,job_id,data,status,digest,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard} AND (?='' OR EXISTS(SELECT 1 FROM jobs WHERE owner=? AND id=? AND json_extract(data,'$.status')='active' AND employer_id=?)) AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND revision=? AND json_extract(data,'$.available')=1 AND json_extract(data,'$.privacy.publication')=1 AND json_extract(data,'$.privacy.processing')=1 AND json_extract(data,'$.qualification') IS NOT NULL)`,
        )
        .bind(
          owner,
          key,
          employerId,
          c.id,
          j?.id ?? "",
          JSON.stringify(offer),
          "pending",
          hash,
          now,
          now,
          actor,
          expected,
          "employer",
          input.jobId,
          owner,
          j?.id ?? "",
          employerId,
          owner,
          c.id,
          c.revision,
        )
        .run();
      if (!r.meta.changes) {
        const row = await db
          .prepare(
            "SELECT digest FROM offers WHERE owner=? AND id=? AND employer_id=?",
          )
          .bind(owner, key, employerId)
          .first<{ digest: string }>();
        if (!row || row.digest !== hash)
          throw new ApiError(
            409,
            "Предложение по этой вакансии уже ожидает ответа или данные изменились",
          );
      }
      return json(await snapshot(), 201);
    }
    if (path[0] === "offers" && path[1] && method === "PATCH") {
      const input = z
        .object({
          status: z.enum(["accepted", "declined", "withdrawn"]),
          declineReason: z.string().trim().min(1).max(500).optional(),
        })
        .strict()
        .superRefine((value, context) => {
          if (value.declineReason !== undefined && value.status !== "declined")
            context.addIssue({ code: "custom", path: ["declineReason"], message: "Причину можно указать только при отказе от предложения" });
        })
        .parse(await body(req));
      const isEmployer = input.status === "withdrawn";
      assertRole(isEmployer ? "employer" : "candidate");
      const result = await db
        .prepare(
          `UPDATE offers SET status=?,updated_at=?${input.declineReason !== undefined ? ",data=json_set(data,'$.declineReason',?)" : ""} WHERE owner=? AND id=? AND status='pending' AND ${guard}${isEmployer ? " AND employer_id=?" : " AND candidate_id=?"}${input.status==='accepted'?" AND NOT EXISTS(SELECT 1 FROM career_records WHERE career_records.owner=offers.owner AND kind='dialogue' AND career_records.id=offers.id) AND EXISTS(SELECT 1 FROM candidates WHERE candidates.owner=offers.owner AND candidates.id=offers.candidate_id AND json_extract(candidates.data,'$.privacy.processing')=1)":""}`,
        )
        .bind(
          ...[
            input.status,
            new Date().toISOString(),
            ...(input.declineReason !== undefined ? [input.declineReason] : []),
            owner,
            path[1],
            actor,
            expected,
            account.role,
            ...(isEmployer ? [employerId] : [account.candidate_id]),
          ],
        )
        .run();
      changed(result.meta.changes);
      return json(await snapshot());
    }
    if (path[0] === "profile" && method === "PATCH") {
      assertRole("candidate");
      const input = profileSchema.parse(await body(req));
      const c = await candidate(owner, account.candidate_id);
      if (!c) throw new ApiError(404, "Профиль не найден");
      if (req.headers.get("if-match") !== String(c.revision))
        throw new ApiError(409, "Профиль изменился. Обновите страницу");
      const initials = input.fullName
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")
        .toUpperCase();
      const result = await db
        .prepare(
          `UPDATE candidates SET data=?,revision=revision+1 WHERE owner=? AND id=? AND revision=? AND ${guard} AND id=?`,
        )
        .bind(
          JSON.stringify({
            ...c,
            ...input,
            initials,
            privacy: input.privacy
              ? { ...input.privacy, consentAt: new Date().toISOString() }
              : c.privacy,
          }),
          owner,
          c.id,
          c.revision,
          actor,
          expected,
          "candidate",
          account.candidate_id,
        )
        .run();
      changed(result.meta.changes);
      return json(await snapshot());
    }
    if (path[0] === "profile" && path[1] === "sync" && method === "POST") {
      assertRole("candidate");
      const c = await candidate(owner, account.candidate_id);
      if (!c) throw new ApiError(404, "Профиль не найден");
      if (!c.privacy?.processing)
        throw new ApiError(403, "Согласие на обработку профиля отозвано");
      if (ctx.mode === "live")
        throw new ApiError(
          409,
          "Связь ID ФСП с личностью ещё не подтверждается провайдером. В рабочем профиле импорт отключён.",
        );
      const achievements = c.fspId
        ? await fspProvider.getAchievements(c.fspId.replace(/^DEMO-/, ""))
        : [];
      const result = await db
        .prepare(
          `UPDATE candidates SET data=?,revision=revision+1 WHERE owner=? AND id=? AND revision=? AND ${guard} AND id=?`,
        )
        .bind(
          JSON.stringify({
            ...c,
            achievements,
            lastSynced: new Date().toISOString(),
          }),
          owner,
          c.id,
          c.revision,
          actor,
          expected,
          "candidate",
          account.candidate_id,
        )
        .run();
      changed(result.meta.changes);
      return json(await snapshot());
    }
    throw new ApiError(404, "Метод API не найден");
  } catch (e) {
    if (e instanceof ApiError || e instanceof ServiceError)
      return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        {
          error: e.issues[0]?.message ?? "Проверьте поля",
          fields: e.flatten().fieldErrors,
        },
        422,
      );
    console.error("API failure", e instanceof Error ? e.message : "unknown");
    return json(
      {
        error:
          "Сервис временно недоступен. Сохраните введённые данные и повторите попытку.",
      },
      503,
    );
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
