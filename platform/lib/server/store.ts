/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import type { AccessContext } from "./access";
import {publicCandidate} from './visibility';
import { scoreAssessment } from "./assessment-engine";
import { env } from "cloudflare:workers";
import seedCandidates from "../demo-candidates.json";
import type {
  Candidate,
  Job,
  Offer,
  AppState,
  Session,
  Assessment,
  Company,
} from "../types";
export function database() {
  if (!env.DB) throw new Error("DATABASE_UNAVAILABLE");
  return env.DB;
}
export type Account = {
  owner: string;
  role: "employer" | "candidate";
  candidate_id: string;
  revision: number;
};
export async function initialize(owner: string) {
  const db = database();
  const existing = await db
    .prepare("SELECT * FROM demo_accounts WHERE owner=?")
    .bind(owner)
    .first<Account>();
  if (existing) {
    await upgrade(owner);
    return existing;
  }
  const now = new Date().toISOString();
  const jobs: Job[] = [
    {
      id: "demo-job-001",
      title: "Frontend-разработчик в продуктовую команду",
      company: "Орбита · демокомпания",
      role: "Frontend",
      grade: "Middle",
      city: "Москва",
      workFormat: "Удалённо",
      salaryMin: 180000,
      salaryMax: 250000,
      skills: ["React", "TypeScript", "Next.js", "Playwright"],
      description:
        "Развиваем платформу для совместной работы команд. Предстоит создавать интерфейсы, работать с доступностью и покрывать ключевые сценарии тестами. В команде есть дизайнер, аналитик и три разработчика. Гибкое начало дня, регулярное ревью и прозрачные цели.",
      status: "active",
      createdAt: now,
    },
    {
      id: "demo-job-002",
      title: "Python-разработчик / API и интеграции",
      company: "Слой · демокомпания",
      role: "Backend",
      grade: "Middle",
      city: "Новосибирск",
      workFormat: "Гибрид",
      salaryMin: 210000,
      salaryMax: 280000,
      skills: ["Python", "FastAPI", "PostgreSQL", "Docker"],
      description:
        "Создаём сервис обработки данных для бизнеса. Ищем разработчика для API, фоновых задач и интеграций. Важны внимание к контрактам, понятный код и желание обсуждать решения с командой. Два дня в офисе по договорённости.",
      status: "active",
      createdAt: now,
    },
    {
      id: "demo-job-003",
      title: "Data Scientist / прогнозирование",
      company: "Вектор · демокомпания",
      role: "Data Science",
      grade: "Middle",
      city: "Казань",
      workFormat: "Удалённо",
      salaryMin: 220000,
      salaryMax: 300000,
      skills: ["Python", "SQL", "CatBoost", "MLflow"],
      description:
        "Помогаем продуктовым командам прогнозировать спрос. Предстоит готовить датасеты, строить базовые модели, проверять качество на временных выборках и вместе с аналитиками оценивать результат экспериментов.",
      status: "active",
      createdAt: now,
    },
  ];
  const starterOffer: Offer = {
    id: "demo-offer-001",
    candidateId: seedCandidates[0].id,
    jobId: jobs[0].id,
    jobTitle: jobs[0].title,
    company: jobs[0].company,
    employerContact: "team@orbita.example",
    salaryMin: 200000,
    salaryMax: 240000,
    message:
      "Алина, нам близок ваш опыт работы с React и доступностью интерфейсов. Предлагаем обсудить задачи нашей продуктовой команды и познакомиться на короткой встрече.",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO demo_accounts(owner,role,candidate_id,revision,seed_version) VALUES(?,?,?,0,1)",
      )
      .bind(owner, "employer", seedCandidates[0].id),
    ...seedCandidates.map((c) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO candidates(owner,id,data,revision) VALUES(?,?,?,0)",
        )
        .bind(owner, c.id, JSON.stringify({ ...c, available: true })),
    ),
    ...jobs.map((j) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO jobs(owner,id,data,digest) VALUES(?,?,?,?)",
        )
        .bind(owner, j.id, JSON.stringify(j), "seed"),
    ),
    db
      .prepare(
        "INSERT OR IGNORE INTO offers(owner,id,candidate_id,job_id,data,status,digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        owner,
        starterOffer.id,
        starterOffer.candidateId,
        starterOffer.jobId,
        JSON.stringify(starterOffer),
        "pending",
        "seed",
        now,
        now,
      ),
  ]);
  await upgrade(owner);
  return (await db
    .prepare("SELECT * FROM demo_accounts WHERE owner=?")
    .bind(owner)
    .first<Account>())!;
}
export async function upgrade(owner: string) {
  const db = database();
  const exists = await db
    .prepare("SELECT seed_version FROM demo_accounts WHERE owner=?")
    .bind(owner)
    .first<{ seed_version: number }>();
  if (!exists || exists.seed_version >= 2) return;
  const company: Company = {
    name: "Орбита · демокомпания",
    industry: "Продуктовая разработка",
    description:
      "Создаём инструменты для совместной работы команд. В демоверсии все контакты вымышлены.",
    contact: "team@orbita.example",
  };
  await db.batch([
    ...seedCandidates.map((c, i) =>
      db
        .prepare(
          "UPDATE candidates SET data=json_set(data,'$.qualification',json(?),'$.privacy',json(?),'$.contact',?,'$.softSkills',json(?),'$.fspId',?) WHERE owner=? AND id=? AND EXISTS(SELECT 1 FROM demo_accounts WHERE owner=? AND seed_version<2)",
        )
        .bind(
          JSON.stringify({
            role: c.role,
            grade: c.grade,
            score: [92, 75, 96, 83, 87, 94, 91, 72, 89, 81, 85, 88][i],
            passedAt: "2026-05-01T10:00:00.000Z",
            nextChangeAt: "2026-07-30T10:00:00.000Z",
            attemptId: "fixture-" + c.id,
            synthetic: true,
          }),
          JSON.stringify({
            processing: true,
            publication: true,
            showAchievements: true,
            consentAt: "2026-05-01T10:00:00.000Z",
          }),
          `candidate${i + 1}@example.test`,
          JSON.stringify(["Работа в команде", "Обратная связь"]),
          c.achievements.length ? "DEMO-" + c.id : "",
          owner,
          c.id,
          owner,
        ),
    ),
    db
      .prepare("INSERT OR IGNORE INTO companies(owner,data) VALUES(?,?)")
      .bind(owner, JSON.stringify(company)),
    db
      .prepare(
        "UPDATE offers SET data=json_insert(data,'$.employerContact',?) WHERE owner=?",
      )
      .bind("team@orbita.example", owner),
    db
      .prepare(
        "UPDATE demo_accounts SET seed_version=2 WHERE owner=? AND seed_version<2",
      )
      .bind(owner),
  ]);
}
export async function company(owner: string): Promise<Company> {
  const row = await database()
    .prepare("SELECT data FROM companies WHERE owner=?")
    .bind(owner)
    .first<{ data: string }>();
  return row
    ? JSON.parse(row.data)
    : { name: "", industry: "", description: "", contact: "" };
}
/** Finalize only the server-saved draft; answers arriving after the deadline are ignored. */
export async function finalizeExpiredAssessments(owner: string, id: string, now = Date.now()) {
  const db = database();
  const rows = await db.prepare(
    "SELECT data,answer_key,status FROM assessments WHERE owner=? AND candidate_id=? AND json_extract(data,'$.expiresAt')<=? AND julianday(json_extract(data,'$.expiresAt'))<=julianday('now') AND (status='active' OR (status='expired' AND json_extract(data,'$.completedAt') IS NULL))",
  ).bind(owner, id, new Date(now).toISOString()).all<{data: string; answer_key: string; status: Assessment["status"]}>();
  for (const row of rows.results) {
    const attempt: Assessment = JSON.parse(row.data);
    const draft = Object.fromEntries(attempt.questions.flatMap((q) => {
      const answer = attempt.draftAnswers?.[q.id];
      return q.options.some((o) => o.id === answer) ? [[q.id, answer!]] : [];
    }));
    const result = scoreAssessment({ ...attempt, status: "active" }, JSON.parse(row.answer_key), draft, Date.parse(attempt.expiresAt));
    // The prior-record comparison protects an in-flight save or submission from replacement.
    await db.prepare(
      "UPDATE assessments SET data=?,status='expired' WHERE owner=? AND id=? AND candidate_id=? AND status=? AND data=? AND julianday(json_extract(data,'$.expiresAt'))<=julianday('now') AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND json_extract(data,'$.privacy.processing')=1)",
    ).bind(JSON.stringify(result), owner, attempt.id, id, row.status, row.data, owner, id).run();
  }
}
export async function assessmentHistory(
  owner: string,
  id: string,
): Promise<Assessment[]> {
  await finalizeExpiredAssessments(owner, id);
  const rows = await database()
    .prepare(
      "SELECT data,status FROM assessments WHERE owner=? AND candidate_id=? ORDER BY created_at DESC",
    )
    .bind(owner, id)
    .all<{ data: string; status: Assessment["status"] }>();
  return rows.results.map((r) => {
    const { resultNonce, ...attempt } = JSON.parse(r.data);
    void resultNonce;
    return { ...attempt, status: r.status };
  });
}
export async function allState(ctx: AccessContext): Promise<AppState> {
  const { dataOwner: owner, account } = ctx,
    db = database();
  const isCandidate = account.role === "candidate";
  const [cs, js, os, fs, organization, history] = await Promise.all([
    db
      .prepare(
        "SELECT data,revision FROM candidates WHERE owner=?" +
          (isCandidate
            ? " AND id=?"
            : " AND json_extract(data,'$.available')=1 AND json_extract(data,'$.privacy.publication')=1 AND json_extract(data,'$.privacy.processing')=1 AND json_extract(data,'$.qualification') IS NOT NULL") +
          " ORDER BY id",
      )
      .bind(...(isCandidate ? [owner, account.candidate_id] : [owner]))
      .all<{ data: string; revision: number }>(),
    db
      .prepare(
        "SELECT data FROM jobs WHERE owner=?" +
          (ctx.mode === "live" && !isCandidate ? " AND employer_id=?" : "") +
          " ORDER BY id",
      )
      .bind(
        ...(ctx.mode === "live" && !isCandidate
          ? [owner, account.owner]
          : [owner]),
      )
      .all<{ data: string }>(),
    db
      .prepare(
        "SELECT data,status,updated_at FROM offers WHERE owner=?" +
          (isCandidate
            ? " AND candidate_id=?"
            : ctx.mode === "live"
              ? " AND employer_id=?"
              : "") +
          " ORDER BY created_at DESC",
      )
      .bind(
        ...(isCandidate
          ? [owner, account.candidate_id]
          : ctx.mode === "live"
            ? [owner, account.owner]
            : [owner]),
      )
      .all<{ data: string; status: Offer["status"]; updated_at: string }>(),
    db
      .prepare("SELECT candidate_id FROM favorites WHERE owner=?")
      .bind(account.owner)
      .all<{ candidate_id: string }>(),
    company(account.owner),
    isCandidate
      ? assessmentHistory(owner, account.candidate_id)
      : Promise.resolve([]),
  ]);
  const offers: Offer[] = os.results.map((o) => ({
    ...JSON.parse(o.data),
    status: o.status,
    updatedAt: o.updated_at,
  }));
  const dialogues=await db.prepare("SELECT id FROM career_records WHERE owner=? AND kind='dialogue'").bind(owner).all<{id:string}>();
  for(const offer of offers)offer.hasDialogue=dialogues.results.some(d=>d.id===offer.id);
  const visibleCandidates: Candidate[] = await Promise.all(cs.results.map(async (row) => {
    const c: Candidate = { ...JSON.parse(row.data), revision: row.revision };
    if (isCandidate) return c;
    return publicCandidate(ctx,c,offers.some(o=>o.candidateId===c.id&&o.status==='accepted'));
  }));
  // Contact disclosure is derived from the accepted record, never trusted from an input or client flag.
  for (const offer of offers) {
    delete offer.candidateContact;
    if (!isCandidate && offer.status === "accepted") {
      const c = await candidate(owner, offer.candidateId);
      if (c?.privacy?.processing) offer.candidateContact = c.contact;
    }
  }
  return {
    notes: isCandidate
      ? []
      : (
          await db
            .prepare(
              "SELECT candidate_id,data,revision FROM hiring_notes WHERE owner=?",
            )
            .bind(account.owner)
            .all<{ candidate_id: string; data: string; revision: number }>()
        ).results
          .map((r) => ({
            ...JSON.parse(r.data),
            candidateId: r.candidate_id,
            revision: r.revision,
          }))
          .filter((n) => visibleCandidates.some((c) => c.id === n.candidateId)),
    candidates: visibleCandidates,
    jobs: js.results.map((j) => JSON.parse(j.data)),
    offers,
    favorites: isCandidate ? [] : fs.results.map((f) => f.candidate_id),
    company: organization,
    assessments: history,
    demoPersonas:
      ctx.mode === "live"
        ? []
        : [
            ...seedCandidates.map((c) => ({ id: c.id, fullName: c.fullName })),
            ...((await candidate(owner, "demo-new-candidate"))
              ? [{ id: "demo-new-candidate", fullName: "Новый кандидат" }]
              : []),
          ],
    session: {
      role: account.role,
      candidateId: account.candidate_id,
      revision: account.revision,
      mode: ctx.mode,
    } as Session,
  };
}
export async function candidate(owner: string, id: string) {
  const row = await database()
    .prepare("SELECT data,revision FROM candidates WHERE owner=? AND id=?")
    .bind(owner, id)
    .first<{ data: string; revision: number }>();
  return row
    ? ({ ...JSON.parse(row.data), revision: row.revision } as Candidate & {
        revision: number;
      })
    : null;
}
export async function job(owner: string, id: string) {
  const row = await database()
    .prepare("SELECT data FROM jobs WHERE owner=? AND id=?")
    .bind(owner, id)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Job) : null;
}
