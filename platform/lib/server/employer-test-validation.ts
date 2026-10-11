/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { z } from "zod";
import { revision, text } from "./career-validation";

const itemId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/)
  .refine((id) => !["__proto__", "prototype", "constructor"].includes(id), "Недопустимый идентификатор");
const questionSchema = z.object({
  id: itemId,
  kind: z.enum(["single", "multiple", "text"]),
  prompt: text(2000),
  points: z.number().int().min(1).max(20),
  options: z.array(z.object({ id: itemId, label: text(500) }).strict()).max(6),
  correctOptionIds: z.array(itemId).max(6),
  explanation: text(2000),
  rubric: text(2000),
}).strict();
export const employerTestDefinitionSchema = z.object({
  title: text(120, 3),
  description: text(3000),
  skill: text(80, 2),
  estimatedMinutes: z.number().int().min(5).max(180),
  passingPercent: z.number().int().min(1).max(100),
  questions: z.array(questionSchema).max(20),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.questions.forEach((q, index) => {
    if (ids.has(q.id)) ctx.addIssue({ code: "custom", path: ["questions", index, "id"], message: "Идентификаторы вопросов должны различаться" });
    ids.add(q.id);
    if (new Set(q.options.map((o) => o.id)).size !== q.options.length || new Set(q.correctOptionIds).size !== q.correctOptionIds.length)
      ctx.addIssue({ code: "custom", path: ["questions", index], message: "Идентификаторы вариантов и ключи не должны повторяться" });
    if (q.correctOptionIds.some((id) => !q.options.some((o) => o.id === id)))
      ctx.addIssue({ code: "custom", path: ["questions", index], message: "Ключ должен указывать на существующий вариант" });
    if (q.kind === "text" && (q.options.length || q.correctOptionIds.length))
      ctx.addIssue({ code: "custom", path: ["questions", index], message: "У открытого вопроса не может быть вариантов или автоматического ключа" });
    if (q.kind === "single" && q.correctOptionIds.length > 1)
      ctx.addIssue({ code: "custom", path: ["questions", index], message: "У одиночного выбора только один правильный вариант" });
  });
});
export const publishableTestSchema = employerTestDefinitionSchema.superRefine((value, ctx) => {
  if (!value.questions.length) ctx.addIssue({ code: "custom", path: ["questions"], message: "Добавьте хотя бы один вопрос" });
  value.questions.forEach((q, index) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", path: ["questions", index], message });
    if (q.prompt.length < 5) fail(`Вопрос ${index + 1}: напишите понятную формулировку`);
    if (q.kind === "text") {
      if (q.rubric.length < 10) fail(`Вопрос ${index + 1}: опишите критерии ручной оценки`);
    } else {
      if (q.options.length < 2 || q.options.some((o) => !o.label)) fail(`Вопрос ${index + 1}: заполните минимум два варианта`);
      if (!q.correctOptionIds.length) fail(`Вопрос ${index + 1}: задайте правильный ответ`);
      if (new Set(q.options.map((o) => o.label.toLocaleLowerCase("ru"))).size !== q.options.length)
        fail(`Вопрос ${index + 1}: тексты вариантов должны различаться`);
    }
  });
});
export const createTestSchema = z.object({ id: z.string().uuid(), data: employerTestDefinitionSchema }).strict();
export const editTestSchema = z.object({ revision, data: employerTestDefinitionSchema }).strict();
export const testActionSchema = z.object({ revision, action: z.enum(["publish", "archive"]) }).strict();
export const invitationSchema = z.object({
  id: z.string().uuid(), revision, candidateId: text(100, 1), dueAt: z.string().datetime(),
}).strict();
const answers = z.record(itemId, z.union([z.string().max(6000), z.array(itemId).max(6)]))
  .refine((value) => Object.keys(value).length <= 20, "Слишком много ответов");
export const attemptActionSchema = z.discriminatedUnion("action", [
  z.object({ revision, action: z.literal("start") }).strict(),
  z.object({ revision, action: z.literal("save"), answers }).strict(),
  z.object({ revision, action: z.literal("submit"), answers: answers.optional() }).strict(),
  z.object({ revision, action: z.literal("decline") }).strict(),
  z.object({ revision, action: z.literal("cancel") }).strict(),
  z.object({ revision, action: z.literal("review"), feedback: text(3000, 10), reviews: z.array(z.object({
    questionId: itemId, points: z.number().int().min(0).max(20), feedback: text(2000, 5),
  }).strict()).min(1).max(20) }).strict(),
]);
