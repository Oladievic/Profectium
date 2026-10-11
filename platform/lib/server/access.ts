/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { database, initialize, type Account } from "./store";
import { ServiceError } from "./security";
export const LIVE_OWNER = "live-profectium-v1";
export type AccessContext = {
  mode: "demo" | "live";
  dataOwner: string;
  account: Account;
};
export async function resolveAccess(
  principal: string,
  live: boolean,
): Promise<AccessContext> {
  if (!live)
    return {
      mode: "demo",
      dataOwner: principal,
      account: await initialize(principal),
    };
  const row = await database()
    .prepare(
      "SELECT owner,role,candidate_id,revision FROM members WHERE owner=?",
    )
    .bind("live:" + principal)
    .first<Account>();
  if (!row)
    throw new ServiceError(
      403,
      "Подтвердите email и создайте рабочий аккаунт в разделе «Аккаунт».",
    );
  return { mode: "live", dataOwner: LIVE_OWNER, account: row };
}
export function accessGuard(ctx: AccessContext) {
  return `EXISTS (SELECT 1 FROM ${ctx.mode === "live" ? "members" : "demo_accounts"} a WHERE a.owner=? AND a.revision=? AND a.role=?)`;
}
