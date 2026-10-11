/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { z } from "zod";
import { grades, roles } from "../types";
export const revision = z.number().int().min(0);
export const text = (max = 2000, min = 0) =>
  z.string().trim().min(min).max(max);
export const skillList = z.array(text(80, 1)).max(20);
export const format = z.enum(["Удалённо", "Гибрид", "Офис"]);
export const onCall = z.enum(["yes", "no", "discuss"]);
export const pay = z.number().int().min(10000).max(2000000);
export const termsSchema = z
  .object({
    salaryMin: pay,
    salaryMax: pay,
    workFormat: format,
    coreHours: text(100),
    onCall,
    firstMonths: text(2000, 10),
    interviewSteps: text(1000),
    reviewProcess: text(1000),
    mentoring: text(500),
  })
  .strict()
  .refine((t) => t.salaryMax >= t.salaryMin, "Проверьте зарплатный диапазон");
export const briefSchema = z
  .object({
    title: text(100, 3),
    role: z.enum(roles),
    grade: z.enum(grades).optional(),
    outcomes: z.array(text(400, 5)).min(1).max(6),
    mandatory: skillList,
    desirable: skillList,
    trainable: skillList,
    salaryMin: pay,
    salaryMax: pay,
    workFormat: format,
    coreHours: text(100),
    onCall,
    coveredSkills: skillList,
  })
  .strict()
  .refine((t) => t.salaryMax >= t.salaryMin, "Проверьте зарплатный диапазон");
export const controlsSchema = z
  .object({
    anonymous: z.boolean(),
    rules: z
      .object({
        minimumSalary: z.number().int().min(0).max(2000000),
        formats: z.array(format).max(3),
        coreHours: text(100),
        onCall,
        strict: z.boolean(),
        interests: skillList,
      })
      .strict(),
  })
  .strict();
export const proofSchema = z
  .object({
    title: text(120, 3),
    skill: text(80, 2),
    summary: text(1000, 10),
    artifact: text(6000, 10),
    published: z.boolean(),
  })
  .strict();
