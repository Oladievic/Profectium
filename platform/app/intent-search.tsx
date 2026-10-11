/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { useState } from "react";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { parseSearchIntent, type SearchIntent } from "@/lib/query-parser";
import type { Filters } from "@/lib/types";

export function IntentSearch({ onApply }: { onApply: (filters: Filters) => void; mode?: "demo" | "live"; sessionRevision?: number }) {
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<SearchIntent | null>(null);
  const parse = () => setIntent(parseSearchIntent(query));
  return (
    <details className="intent-search assessment-card">
      <summary><Search size={18} aria-hidden="true" /> Поиск обычными словами</summary>
      <p className="muted">Опишите специалиста. Встроенные правила превратят запрос в фильтры по навыкам, направлению, формату и зарплате.</p>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); parse(); }}>
        <label className="field-label" htmlFor="candidate-intent">Кого вы ищете?</label>
        <textarea id="candidate-intent" maxLength={500} rows={2} value={query} onChange={(e) => { setQuery(e.target.value); setIntent(null); }} placeholder="Backend Middle, Python и PostgreSQL, удалённо, до 250 тыс, с опытом ФСП" required />
        <div className="button-group">
          <button className="button secondary" type="submit"><SlidersHorizontal size={16} /> Разобрать запрос</button>
          <small className="muted">Все условия применяются одновременно</small>
        </div>
      </form>
      {intent && <div className="intent-result" aria-live="polite">
        <h3>Так будет настроен поиск</h3>
        <p className="small-note">Источник: встроенные правила</p>
        <dl className="intent-filters">
          <div><dt>Категория</dt><dd>{intent.filters.role === "all" ? "Все специализации" : intent.filters.role} · {intent.filters.grade === "all" ? "любой грейд" : intent.filters.grade}</dd></div>
          <div><dt>Формат</dt><dd>{intent.filters.format === "all" ? "Любой" : intent.filters.format}</dd></div>
          <div><dt>Бюджет</dt><dd>{intent.filters.maxSalary ? `до ${Number(intent.filters.maxSalary).toLocaleString("ru-RU")} ₽ / месяц` : "Без ограничения"}</dd></div>
          <div><dt>Достижения ФСП</dt><dd>{intent.filters.hasAchievements ? "Есть в профиле" : "Не обязательны"}</dd></div>
          <div><dt>Текст профиля и навыки</dt><dd>{intent.filters.query || "Без ограничения"}</dd></div>
        </dl>
        {intent.warnings.length > 0 && <ul className="intent-notes">{intent.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        {intent.blocking.length > 0 && <div className="error-banner" role="alert"><strong>Уточните запрос перед применением</strong><ul>{intent.blocking.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
        <p className="small-note">Применение заменит текущие фильтры и привязку к вакансии. Их можно поправить ниже.</p>
        <button type="button" className="button primary" disabled={!intent.canApply} onClick={() => onApply({ ...intent.filters })}>Применить фильтры <ArrowRight size={16} /></button>
      </div>}
    </details>
  );
}
