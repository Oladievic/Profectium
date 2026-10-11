/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
"use client";
import { useState } from "react";
import Link from "next/link";
export default function SignOutPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Не удалось выйти. Попробуйте снова.");
      window.location.assign(new URL("/signin", window.location.origin).href);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось выйти."); setBusy(false); }
  }
  return <main className="auth-screen"><div className="brand">Profectium.</div><h1>Выход из аккаунта</h1><p>Ваши изменения сохранены.</p>{error && <p role="alert">{error}</p>}<button className="button primary" disabled={busy} onClick={() => void signOut()}>{busy ? "Выходим…" : "Выйти"}</button><Link href="/" prefetch={false} className="button secondary">Вернуться</Link></main>;
}
