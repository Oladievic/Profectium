/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { getCurrentUser } from "@/app/session-auth";
import { resolveAccess } from "@/lib/server/access";
import { keyList, createApiKey, revokeApiKey } from "@/lib/server/api-access";
import { fspConnectionStatus, probeFsp } from "@/lib/server/fsp-http";
import { database } from "@/lib/server/store";
import { readJson, response, ServiceError, limit } from "@/lib/server/security";
import { ZodError, z } from "zod";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError(401, "Войдите в аккаунт");
    const url = new URL(req.url),
      ctx = await resolveAccess(
        user.userId,
        url.searchParams.get("mode") === "live",
      );
    if (ctx.account.role !== "employer")
      throw new ServiceError(403, "Раздел доступен работодателю");
    if (req.method === "GET") {
      const events = await database()
        .prepare(
          "SELECT event,entity_id,created_at FROM audit_events WHERE owner=? ORDER BY created_at DESC LIMIT 30",
        )
        .bind(ctx.account.owner)
        .all();
      return response({
        keys: await keyList(ctx.account.owner),
        fsp: fspConnectionStatus(),
        events: events.results,
      });
    }
    if (req.headers.get("origin") !== url.origin)
      throw new ServiceError(403, "Недопустимый источник запроса");
    if (req.headers.get("x-session-revision") !== String(ctx.account.revision))
      throw new ServiceError(409, "Аккаунт изменился. Обновите страницу");
    const input = await readJson(req);
    if (input.action === "create") {
      const { action, ...form } = input;
      void action;
      return response(await createApiKey(ctx, form), 201);
    }
    if (input.action === "revoke") {
      await revokeApiKey(ctx.account.owner, z.string().uuid().parse(input.id));
      return response({ ok: true });
    }
    if (input.action === "probe") {
      await limit("fsp-probe:" + ctx.account.owner, 10, 60000);
      return response(await probeFsp(z.string().parse(input.participantId)));
    }
    throw new ServiceError(422, "Неизвестное действие");
  } catch (e) {
    return response(
      {
        error:
          e instanceof ServiceError
            ? e.message
            : e instanceof ZodError
              ? "Проверьте параметры запроса"
              : "Интеграция временно недоступна",
      },
      e instanceof ServiceError ? e.status : e instanceof ZodError ? 422 : 503,
    );
  }
}
export { handle as GET, handle as POST };
