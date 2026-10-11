/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { z } from "zod";
import { roles, grades } from "../types";
import { text, revision, format, pay } from "./career-validation";
export const safeUrl = text(800, 8).refine((s) => {
  try {
    const u = new URL(s);
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !/^(localhost|127\.|0\.|\[|10\.|192\.168\.)/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}, "Укажите публичный HTTP(S) адрес без логина и пароля");
export const filterSchema = z
  .object({
    query: text(100),
    role: z.enum(["all", ...roles]),
    grade: z.enum(["all", ...grades]),
    format: z.enum(["all", "Удалённо", "Гибрид", "Офис"]),
    maxSalary: z
      .string()
      .regex(/^(|[1-9]\d{0,6})$/)
      .refine((s) => !s || Number(s) <= 2000000),
    hasAchievements: z.boolean(),
    discipline: text(100, 1),
    jobId: text(100),
    sort: z.enum(["relevance", "salary", "experience"]),
  })
  .strict();
export const radarSchema = z
  .object({ title: text(80, 3), filters: filterSchema })
  .strict();
export const sourceSchema = z
  .object({
    name: text(100, 3),
    website: safeUrl,
    category: z.enum(["company", "board", "community", "internship"]),
  })
  .strict();
export const feedSchema = z
  .object({
    externalId: text(100, 1),
    title: text(140, 3),
    company: text(120, 2),
    url: safeUrl,
    role: z.enum(roles),
    grade: z.enum(grades),
    workFormat: format,
    employment: z.enum(["job", "internship"]),
    salaryMin: pay.nullable(),
    salaryMax: pay.nullable(),
    skills: z.array(text(50, 1)).max(20),
    description: text(2000, 20),
    publishedAt: z
      .string()
      .datetime({ offset: true })
      .refine(
        (s) => Date.parse(s) <= Date.now() + 300000,
        "Дата публикации в будущем",
      ),
  })
  .strict()
  .refine(
    (x) => (x.salaryMin === null) === (x.salaryMax === null),
    "Укажите обе границы зарплаты или null",
  )
  .refine(
    (x) => x.salaryMin === null || x.salaryMax! >= x.salaryMin,
    "Неверный диапазон зарплаты",
  );
export const planSchema = z
  .object({
    offerId: text(100, 1),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((s) => {
        const d = new Date(s + "T00:00:00Z");
        return (
          Number.isFinite(+d) &&
          d.toISOString().slice(0, 10) === s &&
          +d >= Date.parse("2020-01-01") &&
          +d <= Date.now() + 365 * 86400000
        );
      }, "Проверьте дату начала"),
    milestones: z.array(text(400, 10)).length(3),
  })
  .strict();
export { revision };
