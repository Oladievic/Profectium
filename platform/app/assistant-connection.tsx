/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
"use client";
export function AssistantConnection({ mode }: { mode: "demo" | "live" }) {
  return <section className="assessment-card" aria-labelledby="assistant-connection-title">
    <span className="section-index">ПОИСК СПЕЦИАЛИСТОВ</span>
    <h2 id="assistant-connection-title">Поиск обычными словами</h2>
    <p>Встроенные правила превращают описание специалиста в фильтры по направлению, уровню, навыкам, формату работы и зарплате.</p>
    <p className="info-box">Разбор доступен в {mode === "demo" ? "демонстрационном" : "рабочем"} каталоге без отдельного подключения и ключей.</p>
    <p className="small-note">Проверьте распознанные условия перед применением. Поиск не меняет квалификацию и не отправляет приглашения.</p>
  </section>;
}
