/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import type { Candidate } from "../types";
import type { AccessContext } from "./access";
import { database } from "./store";
export async function hasGrant(
  ctx: AccessContext,
  candidateId: string,
  field: "identity" | "artifacts",
) {
  const rows = await database()
    .prepare(
      "SELECT data FROM career_records WHERE owner=? AND kind='grant' AND candidate_id=? AND employer_id=?",
    )
    .bind(ctx.dataOwner, candidateId, ctx.account.owner)
    .all<{ data: string }>();
  return rows.results.some((r) => {
    const g = JSON.parse(r.data);
    return (
      !g.revoked &&
      Date.parse(g.expiresAt) > Date.now() &&
      g.fields.includes(field)
    );
  });
}
export async function publicCandidate(
  ctx: AccessContext,
  c: Candidate,
  contactAllowed: boolean,
): Promise<Candidate> {
  const { contact, privacy, controls } = c;
  const anonymous =
    !!controls?.anonymous && !(await hasGrant(ctx, c.id, "identity"));
  return {
    id: c.id,
    fullName: c.fullName,
    initials: c.initials,
    city: c.city,
    workFormat: c.workFormat,
    salaryMin: c.salaryMin,
    salaryMax: c.salaryMax,
    yearsExperience: c.yearsExperience,
    skills: c.skills,
    bio: c.bio,
    softSkills: c.softSkills,
    qualification: c.qualification,
    available: c.available,
    lastSynced: c.lastSynced,
    revision: c.revision,
    role: c.qualification!.role,
    grade: c.qualification!.grade,
    incomingRules: controls?.rules,
    isAnonymous: anonymous,
    achievements: !anonymous && privacy?.showAchievements ? c.achievements : [],
    ...(anonymous
      ? {
          fullName: "Специалист " + c.id.slice(-6),
          initials: "ПФ",
          city: "Не раскрыто",
          bio: "Личные сведения скрыты кандидатом. Направьте предложение или запрос на уточнение; кандидат сам управляет раскрытием.",
        }
      : {}),
    ...(contactAllowed && privacy?.processing ? { contact } : {}),
  };
}
