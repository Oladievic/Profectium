/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { filterCandidates, skillKey } from "./domain";
import type { Candidate, Filters, Job } from "./types";
import type { ActionTask, FeedItem, Listing } from "./signals-types";
export function canonicalUrl(value: string) {
  const u = new URL(value);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|ref$|source$|gclid$|fbclid$)/i.test(key))
      u.searchParams.delete(key);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}
export function itemFingerprint(item: FeedItem) {
  return JSON.stringify({
    ...item,
    url: canonicalUrl(item.url),
    skills: [...new Set(item.skills.map(skillKey))].sort(),
  });
}
export function changedFields(old: FeedItem, next: FeedItem) {
  return (Object.keys(next) as (keyof FeedItem)[]).filter(
    (k) => JSON.stringify(old[k]) !== JSON.stringify(next[k]),
  );
}
export function listingQuality(item: FeedItem, now = Date.now()) {
  const checks = [
    {
      label: "Зарплатный диапазон",
      ok: item.salaryMin !== null && item.salaryMax !== null,
    },
    { label: "Технологии", ok: item.skills.length > 0 },
    { label: "Задачи и контекст", ok: item.description.trim().length >= 100 },
    {
      label: "Дата публикации",
      ok:
        Date.parse(item.publishedAt) <= now &&
        Date.parse(item.publishedAt) >= now - 30 * 86400000,
    },
  ];
  return {
    checks,
    filled: checks.filter((x) => x.ok).length,
    total: checks.length,
    stale: Date.parse(item.publishedAt) < now - 30 * 86400000,
    notes: checks
      .filter((x) => !x.ok)
      .map((x) =>
        x.label === "Дата публикации"
          ? "Публикация старше 30 дней или дата в будущем"
          : `Нужно уточнить: ${x.label.toLowerCase()}`,
      ),
  };
}
export function radarCandidates(
  candidates: Candidate[],
  filters: Filters,
  jobs: Job[],
) {
  return filterCandidates(candidates, filters, jobs).slice(0, 500);
}
export function publicSignature(c: Candidate) {
  return JSON.stringify([
    c.fullName,
    c.role,
    c.grade,
    c.skills,
    c.salaryMin,
    c.salaryMax,
    c.workFormat,
    c.city,
    c.qualification,
    c.achievements,
    c.bio,
    c.available,
  ]);
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function candidateCsv(
  candidates: Candidate[],
  filters: Filters,
  at: string,
) {
  const rows: unknown[][] = [
    ["Profectium — снимок доступных профилей", at],
    ["Фильтры", JSON.stringify(filters)],
    [
      "Имя",
      "Специализация",
      "Категория по тесту",
      "Баллы теста",
      "Основание",
      "Навыки (самоописание)",
      "Формат",
      "Ожидания от, RUB",
      "Ожидания до, RUB",
    ],
  ];
  for (const c of candidates)
    rows.push([
      c.fullName,
      c.qualification?.role ?? "",
      c.qualification?.grade ?? "",
      c.qualification?.score ?? "",
      c.qualification?.synthetic
        ? "Демонстрационный тест"
        : "Пилотный тест; не сертификат",
      c.skills.join(", "),
      c.workFormat,
      c.salaryMin,
      c.salaryMax,
    ]);
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
const icsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const utc = (s: string) =>
  new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function calendar(tasks: ActionTask[], at: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Profectium//Private actions//RU",
    "CALSCALE:GREGORIAN",
  ];
  for (const t of tasks.filter((t) => !t.done && t.kind !== "plan"))
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id.replace(/[^a-zA-Z0-9_-]/g, "-")}@profectium.local`,
      `DTSTAMP:${utc(at)}`,
      `DTSTART:${utc(t.dueAt)}`,
      `DTEND:${utc(new Date(Date.parse(t.dueAt) + 1800000).toISOString())}`,
      `SUMMARY:${icsText(t.title)}`,
      "DESCRIPTION:Личный снимок срока в Profectium. Обновления не синхронизируются автоматически.",
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return (
    lines
      .map((line) => {
        const parts: string[] = [];
        let s = "",
          bytes = 0;
        for (const ch of line) {
          const n = new TextEncoder().encode(ch).length;
          if (bytes + n > 73) {
            parts.push(s);
            s = " ";
            bytes = 1;
          }
          s += ch;
          bytes += n;
        }
        parts.push(s);
        return parts.join("\r\n");
      })
      .join("\r\n") + "\r\n"
  );
}
export const sourceSuggestions = [
  {
    name: "Карьерный сайт компании",
    category: "company",
    note: "Первичный источник; уточните права и формат выгрузки.",
  },
  {
    name: "ИТ-площадка",
    category: "board",
    note: "Используйте разрешённую выгрузку или официальный API.",
  },
  {
    name: "Профессиональное сообщество",
    category: "community",
    note: "Даты, зарплату и компанию нужно перепроверить.",
  },
  {
    name: "Стажировки",
    category: "internship",
    note: "Отдельно указывайте оплату, нагрузку и длительность.",
  },
] as const;
export const feedExample = {
  items: [
    {
      externalId: "demo-frontend-01",
      title: "Frontend: доступные интерфейсы",
      company: "Север · учебная компания",
      url: "https://careers.example.org/jobs/frontend-01?utm_source=demo",
      role: "Frontend",
      grade: "Junior",
      workFormat: "Удалённо",
      employment: "internship",
      salaryMin: 80000,
      salaryMax: 120000,
      skills: ["TypeScript", "React"],
      description:
        "Учебная вакансия для демонстрации импорта: разработать доступные формы личного кабинета, добавить тесты клавиатурной навигации и разобрать результаты с наставником.",
      publishedAt: "2026-10-01T09:00:00.000Z",
    },
  ],
};
export function sameListing(a: Listing, b: FeedItem) {
  return (
    a.company.trim().toLowerCase() === b.company.trim().toLowerCase() &&
    a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
    a.role === b.role
  );
}
