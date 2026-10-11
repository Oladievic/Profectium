/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Все права сохранены. */
"use client";
import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, UserRound } from "lucide-react";
import "./signin.css";

export function SignInForm({ returnTo, initialRegister = false }: { returnTo: string; initialRegister?: boolean }) {
  const [register, setRegister] = useState(initialRegister);
  const [role, setRole] = useState<"candidate" | "employer">("candidate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function authenticate(action: "register" | "login" | "guest", body?: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const result = await fetch(`/api/auth/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await result.json() as { error?: string };
      if (!result.ok) throw new Error(data.error ?? "Не удалось войти.");
      window.location.assign(action === "guest" ? "/?mode=demo&view=catalog" : returnTo);
    } catch (err) { setError(err instanceof Error ? err.message : "Проверьте подключение и попробуйте снова."); setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void authenticate(register ? "register" : "login", {
      email: fields.get("email"), password: fields.get("password"),
      ...(register ? { fullName: fields.get("fullName"), role } : {}),
    });
  }
  return <main className="public-auth">
    <section className="public-auth-story">
      <Link href="/" prefetch={false} className="brand"><Image src="/brand/profectium.svg" width={48} height={48} alt="" unoptimized /><span>Profectium<span className="brand-dot">.</span></span></Link>
      <div><div className="eyebrow">ТАЛАНТ, ПОДТВЕРЖДЁННЫЙ ДЕЛОМ</div><h1>Ваш следующий<br />шаг — здесь<span>.</span></h1><p>Развивайте навыки, находите сильные команды и проверяйте возможности друг друга.</p></div>
      <div className="public-auth-demo"><strong>Открытая демонстрация</strong><p>Можно указать вымышленные имя и email. Подтверждение почты не требуется. В демопространстве уже есть тестовая организация, кандидаты и вакансии.</p></div>
    </section>
    <section className="public-auth-card" aria-label="Вход и регистрация">
      <div className="public-auth-tabs"><button type="button" aria-pressed={!register} onClick={() => { setRegister(false); setError(""); }}>Вход</button><button type="button" aria-pressed={register} onClick={() => { setRegister(true); setError(""); }}>Регистрация</button></div>
      <h2>{register ? "Создать аккаунт" : "С возвращением"}</h2>
      <p>{register ? "Достаточно имени, любого email и пароля." : "Войдите, чтобы продолжить работу."}</p>
      <form onSubmit={submit} className="public-auth-form">
        {register && <><div className="public-auth-roles"><button type="button" aria-pressed={role === "candidate"} onClick={() => setRole("candidate")}><UserRound size={19} />Соискатель</button><button type="button" aria-pressed={role === "employer"} onClick={() => setRole("employer")}><BriefcaseBusiness size={19} />Работодатель</button></div><label>{role === "employer" ? "Название команды или имя" : "Ваше имя"}<input name="fullName" autoComplete="name" minLength={2} maxLength={80} placeholder={role === "employer" ? "Тестовая команда" : "Алексей Тестов"} required /></label></>}
        <label>Email<input name="email" type="email" autoComplete="username" maxLength={150} placeholder="test@example.com" required /></label>
        <label>Пароль<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 6 : 1} maxLength={128} placeholder={register ? "От 6 символов" : "Ваш пароль"} required /></label>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти"}<ArrowRight size={18} /></button>
        {register && <small>Регистрация сразу открывает рабочее пространство. Свой профиль можно заполнить и опубликовать после входа.</small>}
      </form>
      <div className="public-auth-divider"><span>или</span></div>
      <button type="button" className="button secondary public-auth-guest" disabled={busy} onClick={() => void authenticate("guest")}>Попробовать без регистрации</button>
      <small>В гостевом демо можно переключать роли и проверять все основные сценарии. Изменения сохраняются в этом браузере.</small>
    </section>
  </main>;
}
