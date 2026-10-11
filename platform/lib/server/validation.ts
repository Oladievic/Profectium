/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { z } from "zod";
import { roles } from "../types";
const pay = z
  .number()
  .int()
  .min(10000, "Укажите сумму от 10 000 ₽")
  .max(2000000, "Максимальная сумма — 2 000 000 ₽");
const skills = z
  .array(z.string().trim().min(1).max(50))
  .min(1, "Добавьте хотя бы один навык")
  .max(20);
export const jobSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    company: z.string().trim().min(2).max(80),
    role: z.enum(roles),
    grade: z.enum(["Junior", "Middle", "Senior"]),
    city: z.string().trim().min(2).max(60),
    workFormat: z.enum(["Удалённо", "Гибрид", "Офис"]),
    salaryMin: pay,
    salaryMax: pay,
    skills,
    description: z
      .string()
      .trim()
      .min(30, "Описание должно содержать не менее 30 символов")
      .max(5000),
  })
  .strict()
  .refine((v) => v.salaryMax >= v.salaryMin, {
    message: "Верхняя граница зарплаты меньше нижней",
    path: ["salaryMax"],
  });
export const profileSchema = z
  .object({
    fullName: z.string().trim().min(3).max(80),
    role: z.enum(roles),
    grade: z.enum(["Junior", "Middle", "Senior"]),
    city: z.string().trim().min(2).max(60),
    workFormat: z.enum(["Удалённо", "Гибрид", "Офис"]),
    salaryMin: pay,
    salaryMax: pay,
    yearsExperience: z.number().min(0).max(50),
    skills,
    bio: z.string().trim().min(20).max(3000),
    available: z.boolean(),
    contact: z.string().trim().max(150).optional(),
    softSkills: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    fspId: z
      .string()
      .trim()
      .max(80)
      .regex(
        /^[a-zA-Z0-9_-]*$/,
        "Используйте буквы, цифры, дефис или подчёркивание",
      )
      .optional(),
    privacy: z
      .object({
        processing: z.boolean(),
        publication: z.boolean(),
        showAchievements: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => v.salaryMax >= v.salaryMin, {
    message: "Проверьте диапазон зарплаты",
    path: ["salaryMax"],
  });
export const offerSchema = z
  .object({
    candidateId: z.string().min(1).max(80),
    jobId: z.string().max(80).default(""),
    jobTitle: z.string().trim().min(3).max(100).optional(),
    employerContact: z.string().trim().min(5).max(150),
    workFormat: z.enum(['Удалённо','Гибрид','Офис']).default('Удалённо'),
    coreHours: z.string().trim().max(100).default(''),
    onCall: z.enum(['yes','no','discuss']).default('discuss'),
    salaryMin: pay,
    salaryMax: pay,
    message: z
      .string()
      .trim()
      .min(20, "Добавьте сообщение от 20 символов")
      .max(2000),
  })
  .strict()
  .refine((v) => v.salaryMax >= v.salaryMin, {
    message: "Проверьте диапазон зарплаты",
    path: ["salaryMax"],
  });

export const companySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    industry: z.string().trim().min(2).max(100),
    description: z.string().trim().min(20).max(2000),
    contact: z.string().trim().min(5).max(150),
  })
  .strict();
