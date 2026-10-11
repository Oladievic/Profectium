/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { env } from "cloudflare:workers";
import { z } from "zod";
import { ServiceError } from "./security";
type Settings = {
  FSP_API_BASE_URL?: string;
  FSP_API_TOKEN?: string;
  FSP_API_ALLOWED_HOST?: string;
};
const config = () => env as unknown as Settings;
export function validateFspUrl(base: string, allowedHost: string) {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new ServiceError(422, "Некорректный URL провайдера");
  }
  const h = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (u.port && u.port !== "443") ||
    h !== allowedHost.toLowerCase().replace(/\.+$/, "") ||
    !h.includes(".") ||
    h.endsWith(".local") ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h === "localhost" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) ||
    h.includes(":") ||
    h.includes("[")
  )
    throw new ServiceError(
      422,
      "Нужен HTTPS-адрес публичного домена, совпадающий с разрешённым хостом",
    );
  u.hostname = h;
  return u;
}
export function fspConnectionStatus() {
  const c = config();
  return {
    configured: !!(c.FSP_API_BASE_URL && c.FSP_API_ALLOWED_HOST),
    tokenConfigured: !!c.FSP_API_TOKEN,
    provider: "HTTP adapter / provisional contract",
    identityLinkConfigured: false,
  };
}
const responseSchema = z
  .object({
    participantId: z.string().max(80),
    achievements: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            competition: z.string().min(1).max(200),
            discipline: z.string().min(1).max(100),
            place: z.number().int().min(1),
            participants: z.number().int().min(1),
            year: z.number().int().min(2000).max(2100),
            teamRole: z.string().max(100),
          })
          .strict()
          .refine((a) => a.place <= a.participants),
      )
      .max(100),
  })
  .strict();
export async function probeFsp(participantId: string) {
  z.string()
    .regex(/^[A-Za-z0-9_-]{1,80}$/)
    .parse(participantId);
  const c = config();
  if (!c.FSP_API_BASE_URL || !c.FSP_API_ALLOWED_HOST)
    throw new ServiceError(
      503,
      "Внешний провайдер ФСП не настроен. Демо использует синтетический адаптер.",
    );
  const base = validateFspUrl(c.FSP_API_BASE_URL, c.FSP_API_ALLOWED_HOST);
  base.pathname =
    base.pathname.replace(/\/$/, "") +
    "/participants/" +
    encodeURIComponent(participantId) +
    "/achievements";
  const r = await fetch(base.toString(), {
    headers: {
      Accept: "application/json",
      ...(c.FSP_API_TOKEN
        ? { Authorization: "Bearer " + c.FSP_API_TOKEN }
        : {}),
    },
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!r.ok)
    throw new ServiceError(
      502,
      "Провайдер вернул ошибку. Проверьте контракт и настройки.",
    );
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new ServiceError(502, "Провайдер должен вернуть JSON");
  const reader = r.body?.getReader();
  if (!reader) throw new ServiceError(502, "Пустой ответ провайдера");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 262144) {
      await reader.cancel();
      throw new ServiceError(502, "Ответ провайдера превышает лимит");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, pos);
    pos += chunk.length;
  }
  let data;
  try {
    data = responseSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new ServiceError(
      502,
      "Ответ не соответствует предварительному контракту ФСП",
    );
  }
  if (data.participantId !== participantId)
    throw new ServiceError(
      502,
      "ID участника в ответе не совпадает с запросом",
    );
  return {
    participantId,
    count: data.achievements.length,
    checkedAt: new Date().toISOString(),
    contractValid: true,
    identityVerified: false,
    notice:
      "Контракт проверен. Импорт в рабочий профиль требует подтверждения принадлежности ID.",
  };
}
