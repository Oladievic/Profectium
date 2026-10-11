/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { z } from "zod";
import { database, allState, type Account } from "./store";
import { accessGuard, type AccessContext } from "./access";
import { hash, limit, audit, ServiceError } from "./security";
export const apiScopes = [
  "candidates:read",
  "jobs:read",
  "offers:read",
] as const;
export async function keyList(owner: string) {
  const rows = await database()
    .prepare(
      "SELECT id,name,scopes,created_at,expires_at,revoked_at,last_used_at FROM api_keys WHERE owner=? ORDER BY created_at DESC",
    )
    .bind(owner)
    .all<{
      id: string;
      name: string;
      scopes: string;
      created_at: string;
      expires_at: string;
      revoked_at: string | null;
      last_used_at: string | null;
    }>();
  return rows.results.map((r) => ({ ...r, scopes: JSON.parse(r.scopes) }));
}
export async function createApiKey(ctx: AccessContext, input: unknown) {
  if (ctx.account.role !== "employer")
    throw new ServiceError(403, "Ключи интеграций доступны работодателю");
  const data = z
    .object({
      name: z.string().trim().min(3).max(60),
      scopes: z.array(z.enum(apiScopes)).min(1).max(3),
      expiresInDays: z.number().int().min(1).max(90),
    })
    .strict()
    .parse(input);
  await limit("create-key:" + ctx.account.owner, 10, 3600000);
  const active = (await keyList(ctx.account.owner)).filter(
    (k) => !k.revoked_at && Date.parse(k.expires_at) > Date.now(),
  );
  if (active.length >= 10)
    throw new ServiceError(409, "Можно иметь не более 10 действующих ключей");
  const token =
      "pf_" +
      [...crypto.getRandomValues(new Uint8Array(32))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    id = crypto.randomUUID(),
    now = new Date().toISOString(),
    expiresAt = new Date(
      Date.now() + data.expiresInDays * 86400000,
    ).toISOString();
  const inserted = await database()
    .prepare(
      `INSERT INTO api_keys(id,owner,data_owner,mode,name,hash,scopes,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${accessGuard(ctx)} AND (SELECT COUNT(*) FROM api_keys WHERE owner=? AND revoked_at IS NULL AND expires_at>?)<10`,
    )
    .bind(
      id,
      ctx.account.owner,
      ctx.dataOwner,
      ctx.mode,
      data.name,
      await hash(token),
      JSON.stringify([...new Set(data.scopes)]),
      now,
      expiresAt,
      ctx.account.owner,
      ctx.account.revision,
      "employer",
      ctx.account.owner,
      now,
    )
    .run();
  if (!inserted.meta.changes)
    throw new ServiceError(
      409,
      "Роль изменилась или достигнут лимит ключей. Обновите страницу.",
    );
  await audit(ctx.account.owner, "api_key.created", id);
  return { id, token, expiresAt };
}
export async function revokeApiKey(owner: string, id: string) {
  const r = await database()
    .prepare(
      "UPDATE api_keys SET revoked_at=? WHERE id=? AND owner=? AND revoked_at IS NULL",
    )
    .bind(new Date().toISOString(), id, owner)
    .run();
  if (!r.meta.changes)
    throw new ServiceError(404, "Действующий ключ не найден");
  await audit(owner, "api_key.revoked", id);
}
export async function connectedRead(req: Request, resource: string) {
  if (req.method !== "GET")
    throw new ServiceError(
      405,
      "Интеграционный API поддерживает только чтение",
    );
  if (!["candidates", "jobs", "offers"].includes(resource))
    throw new ServiceError(404, "Ресурс не найден");
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer pf_[a-f0-9]{64}$/.test(authorization))
    throw new ServiceError(401, "Нужен действующий API-ключ");
  const db = database(),
    token = authorization.slice(7),
    key = await db
      .prepare(
        "SELECT * FROM api_keys WHERE hash=? AND revoked_at IS NULL AND expires_at>?",
      )
      .bind(await hash(token), new Date().toISOString())
      .first<{
        id: string;
        owner: string;
        data_owner: string;
        mode: "demo" | "live";
        scopes: string;
      }>();
  if (!key)
    throw new ServiceError(401, "Ключ недействителен, отозван или истёк");
  if (!JSON.parse(key.scopes).includes(resource + ":read"))
    throw new ServiceError(403, "У ключа нет доступа к этому ресурсу");
  await limit("api:" + key.id, 60, 60000);
  const account = await db
    .prepare(
      `SELECT owner,role,candidate_id,revision FROM ${key.mode === "live" ? "members" : "demo_accounts"} WHERE owner=?`,
    )
    .bind(key.owner)
    .first<Account>();
  if (!account || (key.mode === "live" && account.role !== "employer"))
    throw new ServiceError(403, "Аккаунт недоступен");
  const data = await allState({
    mode: key.mode,
    dataOwner: key.data_owner,
    account: { ...account, role: "employer" },
  });
  let items: unknown[] = [];
  if (resource === "candidates")
    items = data.candidates.map(({ contact, privacy, fspId, ...c }) => {
      void contact;
      void privacy;
      void fspId;
      return c;
    });
  if (resource === "jobs") items = data.jobs;
  if (resource === "offers")
    items = data.offers.map(
      ({ candidateContact, employerContact, message, ...o }) => {
        void candidateContact;
        void employerContact;
        void message;
        return o;
      },
    );
  const url = new URL(req.url),
    limitValue = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") ?? 25)),
    ),
    offset = Number(url.searchParams.get("offset") ?? 0);
  if (
    !Number.isInteger(limitValue) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new ServiceError(422, "Некорректные limit/offset");
  await db
    .prepare("UPDATE api_keys SET last_used_at=? WHERE id=?")
    .bind(new Date().toISOString(), key.id)
    .run();
  return {
    items: items.slice(offset, offset + limitValue),
    total: items.length,
    nextOffset: offset + limitValue < items.length ? offset + limitValue : null,
    mode: key.mode,
    version: "0.3.0",
    privacy: "Contact details and assessment questions are excluded",
  };
}
