/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { nativeDatabase } from "./sqlite";

// Only the native Next build resolves cloudflare:workers to this module.
// Read environment variables at request time; never serialize them to the client.
export const env = new Proxy({} as Cloudflare.Env & Record<string, unknown>, {
  get(_target, name) {
    if (name === "DB") return nativeDatabase();
    return typeof name === "string" ? process.env[name] : undefined;
  },
});
