/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { database } from "./store";
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function limit(
  id: string,
  max: number,
  windowMs: number,
  now = Date.now(),
) {
  const bucket = `${id}:${Math.floor(now / windowMs)}`;
  const r = await database()
    .prepare(
      "INSERT INTO rate_buckets(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<?",
    )
    .bind(bucket, new Date(now + windowMs).toISOString(), max)
    .run();
  if (!r.meta.changes)
    throw new ServiceError(429, "Слишком много запросов. Повторите позже.");
}
export async function audit(owner: string, event: string, entityId: string) {
  await database()
    .prepare(
      "INSERT INTO audit_events(id,owner,event,entity_id,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), owner, event, entityId, new Date().toISOString())
    .run();
}
export async function readJson(req: Request, maxBytes = 32768) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new ServiceError(415, "Требуется JSON");
  if (Number(req.headers.get("content-length")) > maxBytes)
    throw new ServiceError(413, "Запрос слишком большой");
  const reader = req.body?.getReader();
  if (!reader) throw new ServiceError(400, "Требуется тело запроса");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ServiceError(413, "Запрос слишком большой");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ServiceError(400, "Некорректный JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ServiceError(422, "Ожидается объект JSON");
  return value;
}
export function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
