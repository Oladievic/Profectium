/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
