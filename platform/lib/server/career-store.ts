/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { database, candidate, allState } from "./store";
import { accessGuard, type AccessContext } from "./access";
import { ServiceError } from "./security";
import { hasGrant } from "./visibility";
import { baseProofs } from "../career-domain";
import {
  emptyRules,
  type Proof,
  type CareerState,
  type CareerRecord,
  type Brief,
} from "../career-types";
export type Kind =
  | "employer-test"
  | "employer-attempt"
  | "radar"
  | "source"
  | "import"
  | "listing"
  | "plan"
  | "done"
  | "brief"
  | "proof"
  | "request"
  | "grant"
  | "lab"
  | "dialogue"
  | "view";
export type Row = {
  owner: string;
  kind: Kind;
  id: string;
  candidate_id: string;
  employer_id: string;
  data: string;
  revision: number;
  created_at: string;
};
export const decode = <T>(r: Row): CareerRecord<T> => {
  const { mutationNonce, ...data } = JSON.parse(r.data);
  void mutationNonce;
  return {
    ...data,
    id: r.id,
    revision: r.revision,
    createdAt: r.created_at,
    candidateId: r.candidate_id,
    employerId: r.employer_id,
  };
};
export const scope = (ctx: AccessContext, kind: Kind) =>
  ["brief", "radar", "source", "import", "listing", "done", "employer-test"].includes(kind)
    ? ctx.account.owner
    : ctx.dataOwner;
export async function records(ctx: AccessContext, kind: Kind) {
  return (
    await database()
      .prepare(
        "SELECT * FROM career_records WHERE owner=? AND kind=? ORDER BY created_at DESC",
      )
      .bind(scope(ctx, kind), kind)
      .all<Row>()
  ).results;
}
export async function record(ctx: AccessContext, kind: Kind, id: string) {
  return database()
    .prepare("SELECT * FROM career_records WHERE owner=? AND kind=? AND id=?")
    .bind(scope(ctx, kind), kind, id)
    .first<Row>();
}
export const actorArgs = (ctx: AccessContext) => [
  ctx.account.owner,
  ctx.account.revision,
  ctx.account.role,
];
export function insertStatement(
  ctx: AccessContext,
  kind: Kind,
  id: string,
  data: unknown,
  candidateId = "",
  employerId = "",
  extra = "",
  extraArgs: (string | number)[] = [],
) {
  return database()
    .prepare(
      `INSERT OR IGNORE INTO career_records(owner,kind,id,candidate_id,employer_id,data,revision,created_at) SELECT ?,?,?,?,?,?,0,? WHERE ${accessGuard(ctx)} ${extra}`,
    )
    .bind(
      scope(ctx, kind),
      kind,
      id,
      candidateId,
      employerId,
      JSON.stringify(data),
      new Date().toISOString(),
      ...actorArgs(ctx),
      ...extraArgs,
    );
}
export function updateStatement(
  ctx: AccessContext,
  row: Row,
  revision: number,
  data: unknown,
  extra = "",
  extraArgs: (string | number)[] = [],
) {
  if (revision !== row.revision)
    throw new ServiceError(409, "Версия записи изменилась. Обновите раздел.");
  return database()
    .prepare(
      `UPDATE career_records SET data=?,revision=revision+1 WHERE owner=? AND kind=? AND id=? AND revision=? AND ${accessGuard(ctx)} ${extra}`,
    )
    .bind(
      JSON.stringify(data),
      row.owner,
      row.kind,
      row.id,
      revision,
      ...actorArgs(ctx),
      ...extraArgs,
    );
}
export function changed(n: number) {
  if (!n)
    throw new ServiceError(
      409,
      "Данные или роль изменились. Обновите раздел и повторите действие.",
    );
}
export function role(ctx: AccessContext, r: "candidate" | "employer") {
  if (ctx.account.role !== r)
    throw new ServiceError(403, "Действие недоступно для этой роли.");
}
export async function ownCandidate(ctx: AccessContext) {
  role(ctx, "candidate");
  const c = await candidate(ctx.dataOwner, ctx.account.candidate_id);
  if (!c?.privacy?.processing)
    throw new ServiceError(409, "Обработка профиля отключена.");
  return c;
}
export async function visibleCandidate(ctx: AccessContext, id: string) {
  const c = (await allState(ctx)).candidates.find((c) => c.id === id);
  if (!c) throw new ServiceError(404, "Профиль недоступен.");
  return c;
}
export async function ownedRow(ctx: AccessContext, kind: Kind, id: string) {
  const r = await record(ctx, kind, id);
  if (!r) throw new ServiceError(404, "Запись не найдена.");
  if (kind === "brief") {
    role(ctx, "employer");
    return r;
  }
  const participant =
    ctx.account.role === "candidate"
      ? r.candidate_id === ctx.account.candidate_id
      : r.employer_id === ctx.account.owner;
  if (!participant) throw new ServiceError(404, "Запись не найдена.");
  if (r.candidate_id && kind !== "grant") {
    const c = await candidate(ctx.dataOwner, r.candidate_id);
    if (!c?.privacy?.processing)
      throw new ServiceError(404, "Данные профиля недоступны.");
  }
  return r;
}
export function candidateGuard(
  ctx: AccessContext,
  id: string,
  revision: number,
) {
  return {
    sql: "AND EXISTS(SELECT 1 FROM candidates WHERE owner=? AND id=? AND revision=? AND json_extract(data,'$.privacy.processing')=1)",
    args: [ctx.dataOwner, id, revision],
  };
}
export async function publicProofs(ctx: AccessContext, id: string) {
  const c = await visibleCandidate(ctx, id);
  const own = ctx.account.role === "candidate";
  const raw = await candidate(ctx.dataOwner, id);
  const allowed =
    own || !raw?.controls?.anonymous || (await hasGrant(ctx, id, "artifacts"));
  const rows = allowed
    ? (await records(ctx, "proof")).filter((r) => r.candidate_id === id)
    : [];
  return [
    ...baseProofs(c),
    ...rows.map((r) => decode<Proof>(r)).filter((p) => own || p.published),
  ];
}
export async function careerState(ctx: AccessContext): Promise<CareerState> {
  const isCandidate = ctx.account.role === "candidate";
  const [base, briefs, requests, grants, runs, dialogues, proofs] =
    await Promise.all([
      allState(ctx),
      records(ctx, "brief"),
      records(ctx, "request"),
      records(ctx, "grant"),
      records(ctx, "lab"),
      records(ctx, "dialogue"),
      records(ctx, "proof"),
    ]);
  const valid = (r: Row) =>
    isCandidate
      ? r.candidate_id === ctx.account.candidate_id
      : r.employer_id === ctx.account.owner;
  const allowed = async (rows: Row[]) => {
    const rs: Row[] = [];
    for (const r of rows.filter(valid)) {
      if (
        !r.candidate_id ||
        (await candidate(ctx.dataOwner, r.candidate_id))?.privacy?.processing
      )
        rs.push(r);
    }
    return rs;
  };
  const c = isCandidate
    ? await candidate(ctx.dataOwner, ctx.account.candidate_id)
    : null;
  const proofList: Proof[] = [];
  for (const visible of base.candidates) {
    proofList.push(...baseProofs(visible));
    const raw = await candidate(ctx.dataOwner, visible.id);
    if (
      isCandidate ||
      !raw?.controls?.anonymous ||
      (await hasGrant(ctx, visible.id, "artifacts"))
    )
      proofList.push(
        ...proofs
          .filter((r) => r.candidate_id === visible.id)
          .map((r) => decode<Proof>(r))
          .filter((p) => isCandidate || p.published),
      );
  }
  let recipients: { id: string; name: string }[] = [];
  if (isCandidate) {
    if (ctx.mode === "demo")
      recipients = [{ id: ctx.account.owner, name: "Орбита · демокомпания" }];
    else {
      const rows = await database()
        .prepare(
          "SELECT m.owner,c.data FROM members m JOIN companies c ON c.owner=m.owner WHERE m.role='employer' LIMIT 200",
        )
        .all<{ owner: string; data: string }>();
      recipients = rows.results.map((r) => ({
        id: r.owner,
        name: JSON.parse(r.data).name,
      }));
    }
  }
  const views = isCandidate
    ? (await records(ctx, "view")).filter(valid).map((r) => ({
        id: r.id,
        at: JSON.parse(r.data).at,
        employer:
          recipients.find((x) => x.id === r.employer_id)?.name ?? "Компания",
        candidateId: r.candidate_id,
      }))
    : [];
  return {
    briefs: isCandidate ? [] : briefs.map((r) => decode<Brief>(r)),
    proofs: proofList,
    requests: (await allowed(requests)).map((r) => decode(r)),
    grants: isCandidate ? grants.filter(valid).map((r) => decode(r)) : [],
    runs: isCandidate ? runs.filter(valid).map((r) => decode(r)) : [],
    dialogues: (await allowed(dialogues))
      .filter((r) =>
        base.offers.some((o) => o.id === JSON.parse(r.data).offerId),
      )
      .map((r) => decode(r)),
    recipients,
    controls:
      c?.controls ??
      (isCandidate ? { anonymous: false, rules: emptyRules } : null),
    candidateRevision: c?.revision ?? 0,
    views,
  };
}
