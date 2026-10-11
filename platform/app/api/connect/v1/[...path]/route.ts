/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { connectedRead } from "@/lib/server/api-access";
import { response, ServiceError } from "@/lib/server/security";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await context.params).path;
    if (path.length !== 1) throw new ServiceError(404, "Ресурс не найден");
    return response(await connectedRead(req, path[0]));
  } catch (e) {
    return response(
      {
        error:
          e instanceof ServiceError ? e.message : "Сервис временно недоступен",
      },
      e instanceof ServiceError ? e.status : 503,
    );
  }
}
