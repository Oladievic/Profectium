/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { parseSearchIntent, type SearchIntent } from "../query-parser";
export function assistantStatus() {
  return { configured: true, engine: "Правила Profectium", notice: "Разбор работает по встроенному словарю и правилам. Внешние сервисы не требуются.", maxQueryLength: 500, requestsPerMinute: 10, requestsPerDay: 100 };
}
export async function parseWithAssistant(query: string): Promise<{ intent: SearchIntent; engine: string }> {
  return { intent: parseSearchIntent(query), engine: "Правила Profectium" };
}
