/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, BadgeCheck, Layers, ShieldCheck } from "lucide-react";
import { roles, grades, type AppState, type Candidate, type Filters, type Offer } from "@/lib/types";
import { filterCandidates, salary, statusLabel } from "@/lib/domain";
import { defaultFilters } from "@/lib/types";
import { MotionReveal } from "./motion";

export function CategoryMatrix({ candidates, filters, onApply }: {
  candidates: Candidate[]; filters: Filters; onApply: (filters: Filters) => void;
}) {
  return <MotionReveal><section className="upgrade-categories" aria-label="Категории специалистов">
    <div className="upgrade-section-title"><div><span className="upgrade-kicker">НАЧНИТЕ С КАТЕГОРИИ</span><h2>Нужная специализация. Подтверждённый грейд.</h2></div><p>Количество доступных профилей в каждой категории</p></div>
    <div className="upgrade-category-grid">{roles.map(role => <article className="upgrade-category-card" key={role}>
      <h3>{role}</h3><div>{grades.map(grade => {
        const count = filterCandidates(candidates, { ...defaultFilters, role, grade }, []).length;
        const selected = filters.role === role && filters.grade === grade && filters.jobId === "all";
        return <button key={grade} aria-pressed={selected} aria-label={`${role} ${grade}: ${count} специалистов`} onClick={() => onApply({ ...defaultFilters, role, grade })}>
          <span>{grade}</span><strong className="upgrade-category-count">{count}</strong>
        </button>;
      })}</div>
    </article>)}</div>
  </section></MotionReveal>;
}

export function UpgradeAbout({ data, onNavigate }: { data: AppState; onNavigate: (view: string) => void }) {
  const [audience, setAudience] = useState<"candidate" | "employer">(data.session.role);
  const candidate = audience === "candidate";
  return <div className="upgrade-landing">
    <section className="upgrade-hero upgrade-landing-hero">
      <div>
        <Image className="upgrade-fsp-wordmark" src="/upgrade/fsp-wordmark-light.svg" alt="Федерация спортивного программирования" width={112} height={38} unoptimized />
        <div className="upgrade-kicker" style={{ margin: "28px 0 18px" }}>PROFECTIUM · КАРЬЕРА ЧЕРЕЗ ПОДТВЕРЖДЁННЫЙ ОПЫТ</div>
        <h1>Работодатель пишет первым.<br /><em>С зарплатой.</em></h1>
        <p>Вы подтверждаете навыки. Компания находит вашу категорию и предлагает конкретную работу с открытыми условиями.</p>
        <div className="upgrade-role-switch" aria-label="Для кого платформа" style={{ marginTop: 24 }}>
          <button aria-pressed={candidate} onClick={() => setAudience("candidate")}>Кандидату</button>
          <button aria-pressed={!candidate} onClick={() => setAudience("employer")}>Работодателю</button>
        </div>
        <p>{candidate ? "Один профиль, проверяемая категория и право выбирать, кто получит ваш контакт." : "Находите нужный грейд, изучайте основания оценки и проверяйте навыки на задачах вашей команды."}</p>
        <div className="button-group"><button className="button primary" onClick={() => onNavigate(data.session.role === "employer" ? "catalog" : "assessment")}>Открыть моё пространство <ArrowUpRight size={17} /></button><button className="button secondary" onClick={() => onNavigate("account")}>Аккаунт и доступ</button></div>
      </div>
      <figure className="upgrade-landing-photo"><Image src="/upgrade/fsp-event.jpeg" alt="Мероприятие Федерации спортивного программирования" width={950} height={680} unoptimized /><figcaption>ФСП · ФОТОГРАФИЯ ИЗ ПРЕДОСТАВЛЕННОГО ДИЗАЙН-ПАКЕТА</figcaption></figure>
    </section>
    <MotionReveal><section className="upgrade-mechanics">
      <span className="upgrade-kicker">КАК ЭТО РАБОТАЕТ</span><h2>Категория вместо сотни откликов.</h2>
      <div className="upgrade-steps">{(candidate ? [
        ["01 / ВАШ ПРОФИЛЬ", "Опыт получает контекст", "Расскажите о специализации, задачах и формате работы. Навыки из анкеты отдельно помечены как заявленные."],
        ["02 / ПОДТВЕРЖДЕНИЕ", "Грейд опирается на результат", "Опрос и тест формируют категорию. Достижения ФСП добавляют отдельное основание оценки. Неудачная попытка не понижает грейд."],
        ["03 / ПРЯМОЙ КОНТАКТ", "Вы выбираете предложение", "Сразу видите зарплату и условия, задаёте вопросы и проходите тест команды. Контакты открываются после вашего согласия."],
      ] : [
        ["01 / ПОТРЕБНОСТЬ", "Выберите задачу и категорию", "Укажите специализацию, подтверждённый грейд, стек, формат и бюджет. Поиск обычным языком помогает настроить фильтры."],
        ["02 / ОСНОВАНИЯ", "Оцените то, что проверяемо", "Сравните результаты тестов, достижения и заявленные навыки. Создайте свой тест с автоматической и ручной проверкой."],
        ["03 / ПРИГЛАШЕНИЕ", "Предложите конкретные условия", "Отправьте вакансию с зарплатой, согласуйте детали в диалоге и следите за результатом на рабочем пульте."],
      ]).map(([number, title, description]) => <article key={number}><span className="upgrade-kicker">{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section></MotionReveal>
    <div className="about-grid">
      <article className="about-card"><BadgeCheck /><h2>Основания видны</h2><p>Тест даёт до 60 баллов, достижения — до 20. При подборе под вакансию совпавшие навыки добавляют до 15, пересечение зарплат — до 5. Формула открыта в профиле.</p></article>
      <article className="about-card"><Layers /><h2>Результат спортивного опыта</h2><p>Дисциплина, место, состав зачёта и роль в соревновании дополняют профиль. Спортивный результат сам по себе не присваивает коммерческий грейд.</p></article>
      <article className="about-card"><ShieldCheck /><h2>Управление видимостью</h2><p>Кандидат управляет публикацией и достижениями. Компания видит свои взаимодействия. Ключи тестов и черновики ответов защищены на сервере.</p></article>
    </div>
    <aside className="upgrade-callout" style={{ marginTop: 24 }}><strong>{data.session.mode === "demo" ? "Открыто ваше локальное демопространство" : "Открыто рабочее пространство"}</strong><p>{data.session.mode === "demo" ? "Исходные профили, компании и соревнования вымышлены. Переключение деморолей позволяет пройти обе стороны процесса. Изменения сохраняются в локальной базе." : "Роль привязана к аккаунту. Доступ к профилям и взаимодействиям проверяется сервером."} Реальный реестр ФСП пока не предоставлен; текущий источник достижений — демонстрационный. Почтовая регистрация и внешние подключения требуют настройки провайдеров.</p><a className="text-button" href="/openapi.json" target="_blank" rel="noreferrer">Документация API · OpenAPI <ArrowUpRight size={15} /></a></aside>
  </div>;
}

export function OfferEvidence({ offer, candidate }: { offer: Offer; candidate?: Candidate }) {
  const fmt = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const overlap = candidate && offer.salaryMin <= candidate.salaryMax && offer.salaryMax >= candidate.salaryMin;
  const high = Math.max(offer.salaryMax, candidate?.salaryMax ?? 0, 1);
  const rangeStyle = (min: number, max: number) => { const width = Math.max(1, Math.min(100, (max - min) / high * 100)); return { marginLeft: `${Math.min(100 - width, min / high * 100)}%`, width: `${width}%` }; };
  return <details className="upgrade-offer-evidence"><summary>Условия и история предложения</summary>
    <div className="upgrade-salary-comparison">
      <div><span>Предложение компании</span><strong>{salary(offer.salaryMin, offer.salaryMax)}</strong><div className="upgrade-range"><i style={rangeStyle(offer.salaryMin, offer.salaryMax)} /></div></div>
      {candidate && <><div><span>Текущие ожидания кандидата</span><strong>{salary(candidate.salaryMin, candidate.salaryMax)}</strong><div className="upgrade-range candidate"><i style={rangeStyle(candidate.salaryMin, candidate.salaryMax)} /></div></div><p>{overlap ? "Диапазоны пересекаются — есть основа для обсуждения." : "Диапазоны не пересекаются — уточните бюджет до встречи."} Все суммы — в месяц до налогов. Ожидания могли измениться после отправки.</p></>}
      {offer.workFormat && <p>Формат: {offer.workFormat}{offer.coreHours ? ` · Часы команды: ${offer.coreHours}` : ""}</p>}
    </div>
    <ol className="upgrade-offer-timeline"><li><strong>Приглашение отправлено</strong><time dateTime={offer.createdAt}>{fmt(offer.createdAt)}</time></li><li><strong>{statusLabel(offer.status)}</strong><span>{offer.status === "pending" ? "Решение ещё не получено" : fmt(offer.updatedAt)}</span></li></ol>
    <p className="small-note">История основана на сохранённых действиях. Открытие страницы не считается ответом кандидата.</p>
  </details>;
}
