/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { env } from "cloudflare:workers";
import { z } from "zod";
import { database } from "./store";
import { LIVE_OWNER } from "./access";
import { hash, limit, ServiceError } from "./security";
import type { Candidate } from "../types";
const settings = () =>
  env as unknown as {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    OTP_SECRET?: string;
  };
export const mailReady = () =>
  !!(
    settings().RESEND_API_KEY &&
    settings().EMAIL_FROM &&
    (settings().OTP_SECRET?.length ?? 0) >= 32
  );
export async function member(owner: string) {
  return database()
    .prepare(
      "SELECT owner,role,candidate_id,full_name,email,verified_at,revision FROM members WHERE owner=?",
    )
    .bind(owner)
    .first<{
      owner: string;
      role: "employer" | "candidate";
      candidate_id: string;
      full_name: string;
      email: string;
      verified_at: string;
      revision: number;
    }>();
}
async function codeHash(
  id: string,
  owner: string,
  email: string,
  code: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(settings().OTP_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode([id, owner, email, code].join("\0")),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function requestCode(owner: string, input: unknown) {
  const form = z
    .object({
      email: z
        .string()
        .trim()
        .email()
        .max(150)
        .transform((s) => s.toLowerCase()),
      role: z.enum(["candidate", "employer"]),
      fullName: z.string().trim().min(3).max(80),
      processing: z.literal(true),
    })
    .strict()
    .parse(input);
  if (!mailReady())
    throw new ServiceError(
      503,
      "Отправка писем ещё не настроена. Демо доступно; подтверждение email будет доступно после подключения почтового провайдера.",
    );
  if (await member(owner))
    throw new ServiceError(
      409,
      "Рабочий аккаунт уже зарегистрирован; роль закреплена за ним.",
    );
  await limit("enroll-owner:" + owner, 3, 3600000);
  await limit("enroll-email:" + (await hash(form.email)), 5, 3600000);
  const id = crypto.randomUUID(),
    code = String(
      crypto.getRandomValues(new Uint32Array(1))[0] % 1000000,
    ).padStart(6, "0"),
    now = Date.now(),
    expiresAt = new Date(now + 10 * 60000).toISOString();
  const digest = await codeHash(id, owner, form.email, code);
  const db = database();
  await db.batch([
    db
      .prepare(
        "UPDATE email_challenges SET consumed='superseded' WHERE owner=? AND consumed IS NULL",
      )
      .bind(owner),
    db
      .prepare(
        "INSERT INTO email_challenges(id,owner,email,role,full_name,code_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        owner,
        form.email,
        form.role,
        form.fullName,
        digest,
        new Date(now).toISOString(),
        expiresAt,
      ),
  ]);
  try {
    const s = settings();
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "profectium-verification-" + id,
      },
      body: JSON.stringify({
        from: s.EMAIL_FROM,
        to: [form.email],
        subject: "Profectium — подтверждение email",
        text: `Ваш код Profectium: ${code}. Он действует 10 минут. Если вы не запрашивали подтверждение, проигнорируйте письмо.`,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!r.ok) throw new Error("delivery failed");
  } catch {
    await database()
      .prepare(
        "UPDATE email_challenges SET consumed='delivery-failed' WHERE id=?",
      )
      .bind(id)
      .run();
    throw new ServiceError(
      503,
      "Письмо не удалось отправить. Повторите позже.",
    );
  }
  return { challengeId: id, expiresAt, email: form.email };
}
export async function verifyCode(owner: string, input: unknown) {
  const form = z
    .object({
      challengeId: z.string().uuid(),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict()
    .parse(input);
  if (!mailReady())
    throw new ServiceError(503, "Почтовое подтверждение не настроено.");
  await limit("verify:" + owner, 15, 600000);
  const db = database(),
    r = await db
      .prepare("SELECT * FROM email_challenges WHERE id=? AND owner=?")
      .bind(form.challengeId, owner)
      .first<{
        id: string;
        email: string;
        role: "candidate" | "employer";
        full_name: string;
        code_hash: string;
        attempts: number;
        expires_at: string;
        consumed: string | null;
      }>();
  if (
    !r ||
    r.consumed ||
    r.attempts >= 5 ||
    Date.parse(r.expires_at) <= Date.now()
  )
    throw new ServiceError(
      409,
      "Код недоступен или истёк. Запросите новое письмо.",
    );
  const digest = await codeHash(r.id, owner, r.email, form.code);
  if (digest !== r.code_hash) {
    await db
      .prepare(
        "UPDATE email_challenges SET attempts=attempts+1 WHERE id=? AND consumed IS NULL AND attempts<5",
      )
      .bind(r.id)
      .run();
    throw new ServiceError(422, "Код не совпал. Проверьте письмо.");
  }
  const nonce = crypto.randomUUID(),
    candidateId = crypto.randomUUID(),
    now = new Date().toISOString();
  const c: Candidate = {
    id: candidateId,
    fullName: r.full_name,
    initials: r.full_name
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
    skills: ["Укажите навыки"],
    softSkills: [],
    bio: "Расскажите о ваших проектах, задачах и результатах.",
    achievements: [],
    available: false,
    contact: r.email,
    fspId: "",
    privacy: {
      processing: true,
      publication: false,
      showAchievements: false,
      consentAt: now,
    },
  };
  const claim =
    "EXISTS(SELECT 1 FROM email_challenges WHERE id=? AND owner=? AND consumed=?)";
  const statements = [
    db
      .prepare(
        "UPDATE email_challenges SET consumed=? WHERE id=? AND owner=? AND consumed IS NULL AND attempts<5 AND expires_at>? AND code_hash=?",
      )
      .bind(nonce, r.id, owner, now, digest),
    db
      .prepare(
        `INSERT OR IGNORE INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) SELECT ?,?,?,?,?,?,0 WHERE ${claim}`,
      )
      .bind(
        owner,
        r.role,
        r.role === "candidate" ? candidateId : "",
        r.email,
        r.full_name,
        now,
        r.id,
        owner,
        nonce,
      ),
  ];
  if (r.role === "candidate")
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO candidates(owner,id,data,revision) SELECT ?,?,?,0 WHERE ${claim} AND EXISTS(SELECT 1 FROM members WHERE owner=? AND candidate_id=?)`,
        )
        .bind(
          LIVE_OWNER,
          candidateId,
          JSON.stringify(c),
          r.id,
          owner,
          nonce,
          owner,
          candidateId,
        ),
    );
  else
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO companies(owner,data) SELECT ?,? WHERE ${claim} AND EXISTS(SELECT 1 FROM members WHERE owner=? AND email=?)`,
        )
        .bind(
          owner,
          JSON.stringify({
            name: r.full_name,
            industry: "ИТ",
            description: "Заполните информацию о компании и команде.",
            contact: r.email,
          }),
          r.id,
          owner,
          nonce,
          owner,
          r.email,
        ),
    );
  const results = await db.batch(statements);
  if (!results[0].meta.changes || !results[1].meta.changes)
    throw new ServiceError(
      409,
      "Подтверждение недоступно. Проверьте существующий аккаунт или используйте другой адрес.",
    );
  return member(owner);
}
