/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

/** Employer-authored tests are private hiring evidence and never change platform grade. */
export type EmployerQuestionKind = "single" | "multiple" | "text";
export type EmployerQuestion = {
  id: string;
  kind: EmployerQuestionKind;
  prompt: string;
  points: number;
  options: { id: string; label: string }[];
  correctOptionIds: string[];
  explanation: string;
  rubric: string;
};
export type EmployerTestDefinition = {
  title: string;
  description: string;
  skill: string;
  estimatedMinutes: number;
  passingPercent: number;
  questions: EmployerQuestion[];
};
export type EmployerTest = EmployerTestDefinition & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  state: "draft" | "published" | "archived";
};
export type EmployerTestAnswers = Record<string, string | string[]>;
export type EmployerTestReview = { questionId: string; points: number; feedback: string };
export type EmployerTestResult = {
  earnedPoints: number;
  maxPoints: number;
  percent: number | null;
  passed: boolean | null;
  pendingReview: number;
  final: boolean;
  feedback: string;
  breakdown: {
    questionId: string;
    points: number | null;
    maxPoints: number;
    correct: boolean | null;
    feedback: string;
    manual: boolean;
  }[];
};
export type EmployerTestAttemptSummary = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  testId: string;
  testRevision: number;
  title: string;
  skill: string;
  employerId: string;
  employerName: string;
  candidateId: string;
  dueAt: string;
  estimatedMinutes: number;
  questionCount: number;
  state: "invited" | "active" | "submitted" | "reviewed" | "declined" | "cancelled";
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expired: boolean;
  savedAnswers: number;
  result: EmployerTestResult | null;
};
export type EmployerTestAttempt = EmployerTestAttemptSummary & {
  description: string;
  passingPercent: number;
  /** Answer keys and author explanations are never included here. */
  questions: Omit<EmployerQuestion, "correctOptionIds" | "explanation">[];
  /** Employer gets answers only once candidate has submitted. */
  answers: EmployerTestAnswers;
};
export type EmployerTestsState = {
  tests: EmployerTest[];
  attempts: EmployerTestAttemptSummary[];
};
