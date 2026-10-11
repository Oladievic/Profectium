/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Все права сохранены. */
import { ZodError } from "zod";
import { createGuestUser, loginPublicUser, publicAuthEnabled, publicUser, registerPublicUser, revokeSession, sessionCookie } from "@/lib/server/public-auth";
import { readJson, response, ServiceError } from "@/lib/server/security";
export const dynamic = "force-dynamic";

async function handle(req: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    if (!publicAuthEnabled()) throw new ServiceError(404, "Этот способ входа недоступен.");
    const { path } = await context.params;
    const action = path.join("/");
    if (req.method === "GET" && action === "session") return response({ user: await publicUser(req.headers), emailVerificationRequired: false });
    if (req.method !== "POST") throw new ServiceError(405, "Метод не поддерживается.");
    if (req.headers.get("origin") !== new URL(req.url).origin) throw new ServiceError(403, "Недопустимый источник запроса.");
    if (action === "logout") {
      await revokeSession(req.headers);
      const res = response({ ok: true });
      res.headers.set("Set-Cookie", sessionCookie("", req.url));
      return res;
    }
    const current = await publicUser(req.headers);
    if (current && !current.guest) throw new ServiceError(409, "Сначала выйдите из текущего аккаунта.");
    const result = action === "register" ? await registerPublicUser(await readJson(req))
      : action === "login" ? await loginPublicUser(await readJson(req))
      : action === "guest" ? await createGuestUser()
      : null;
    if (!result) throw new ServiceError(404, "Действие не найдено.");
    await revokeSession(req.headers);
    const res = response({ user: result.user, emailVerificationRequired: false }, action === "login" ? 200 : 201);
    res.headers.set("Set-Cookie", sessionCookie(result.token, req.url));
    return res;
  } catch (error) {
    return response({ error: error instanceof ServiceError ? error.message : error instanceof ZodError ? "Проверьте поля: имя от 2 символов, email и пароль от 6 символов." : "Не удалось выполнить вход. Попробуйте ещё раз." }, error instanceof ServiceError ? error.status : error instanceof ZodError ? 422 : 503);
  }
}
export { handle as GET, handle as POST };
