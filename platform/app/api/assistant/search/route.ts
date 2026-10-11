/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { getCurrentUser } from "@/app/session-auth";
import { resolveAccess } from "@/lib/server/access";
import { assistantStatus, parseWithAssistant } from "@/lib/server/search-assistant";
import { audit, limit, readJson, response, ServiceError } from "@/lib/server/security";
import { z, ZodError } from "zod";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ query: z.string().trim().min(1).max(500), consent: z.literal(true).optional() }).strict();
async function handle(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError(401, "Войдите в аккаунт");
    const url = new URL(req.url);
    const mode = z.enum(["demo", "live"]).parse(url.searchParams.get("mode") ?? "demo");
    const ctx = await resolveAccess(user.userId, mode === "live");
    if (ctx.account.role !== "employer") throw new ServiceError(403, "Поиск специалистов доступен работодателю");
    if (req.method === "GET") return response(assistantStatus());
    if (req.headers.get("origin") !== url.origin) throw new ServiceError(403, "Недопустимый источник запроса");
    if (req.headers.get("x-session-revision") !== String(ctx.account.revision)) throw new ServiceError(409, "Аккаунт изменился. Обновите страницу");
    const input = inputSchema.parse(await readJson(req, 4096));
    await limit("search-assistant-minute:" + ctx.account.owner, 10, 60000);
    await limit("search-assistant-day:" + ctx.account.owner, 100, 86400000);
    const result = await parseWithAssistant(input.query);
    const fresh = await resolveAccess(user.userId, mode === "live");
    if (fresh.account.role !== "employer" || fresh.account.revision !== ctx.account.revision) throw new ServiceError(409, "Аккаунт изменился во время запроса. Обновите страницу");
    await audit(ctx.account.owner, "assistant.search.parsed", crypto.randomUUID());
    return response(result);
  } catch (error) {
    return response({ error: error instanceof ServiceError ? error.message : error instanceof ZodError ? "Проверьте текст поискового запроса" : "Разбор временно недоступен. Используйте локальный режим." }, error instanceof ServiceError ? error.status : error instanceof ZodError ? 422 : 503);
  }
}
export { handle as GET, handle as POST };
