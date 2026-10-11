/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { getCurrentUser } from "@/app/session-auth";
import {
  mailReady,
  member,
  requestCode,
  verifyCode,
} from "@/lib/server/enrollment";
import { readJson, response, ServiceError } from "@/lib/server/security";
import { ZodError } from "zod";
import { publicAuthEnabled, publicUser } from "@/lib/server/public-auth";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError(401, "Войдите через аккаунт платформы.");
    if (req.method === "GET") {
      const publicIdentity = publicAuthEnabled() ? await publicUser(req.headers) : null;
      return response({
        member: await member("live:" + user.userId),
        emailDeliveryConfigured: mailReady(),
        identityProvider: publicAuthEnabled() ? "Profectium" : "Локальный профиль",
        publicAuth: publicAuthEnabled(),
        guest: publicIdentity?.guest ?? false,
        emailVerificationRequired: !publicAuthEnabled(),
      });
    }
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new ServiceError(403, "Недопустимый источник запроса");
    if (publicAuthEnabled()) throw new ServiceError(422, "Подтверждение почты не требуется. Регистрация доступна на странице входа.");
    const input = await readJson(req);
    if (input.action === "request") {
      const { action, ...form } = input;
      void action;
      return response(await requestCode("live:" + user.userId, form), 201);
    }
    if (input.action === "verify") {
      const { action, ...form } = input;
      void action;
      return response({
        member: await verifyCode("live:" + user.userId, form),
      });
    }
    throw new ServiceError(422, "Неизвестное действие");
  } catch (e) {
    return response(
      {
        error:
          e instanceof ServiceError
            ? e.message
            : e instanceof ZodError
              ? "Проверьте поля формы"
              : "Сервис временно недоступен",
      },
      e instanceof ServiceError ? e.status : e instanceof ZodError ? 422 : 503,
    );
  }
}
export { handle as GET, handle as POST };
