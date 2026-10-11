/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import type { Filters, Role } from "./types";
export type SignalRecord<T> = T & {
  id: string;
  revision: number;
  createdAt: string;
};
export type Radar = SignalRecord<{
  title: string;
  filters: Filters;
  seen: Record<string, string>;
  checkedAt: string;
  paused: boolean;
}>;
export type RadarView = Omit<Radar, "seen"> & {
  total: number;
  added: string[];
  changed: string[];
  removed: number;
  ids: string[];
};
export type FeedSource = SignalRecord<{
  name: string;
  website: string;
  category: "company" | "board" | "community" | "internship";
  active: boolean;
}>;
export type FeedItem = {
  externalId: string;
  title: string;
  company: string;
  url: string;
  role: Role;
  grade: "Junior" | "Middle" | "Senior";
  workFormat: "Удалённо" | "Гибрид" | "Офис";
  employment: "job" | "internship";
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  description: string;
  publishedAt: string;
};
export type Listing = SignalRecord<
  FeedItem & {
    sourceId: string;
    fingerprint: string;
    review: "pending" | "accepted" | "rejected";
    firstSeenAt: string;
    lastSeenAt: string;
    history: { at: string; fields: string[] }[];
  }
>;
export type ImportLine = {
  index: number;
  status: "new" | "changed" | "unchanged" | "invalid" | "duplicate";
  errors: string[];
  warnings: string[];
  id?: string;
  expectedRevision?: number;
  item?: FeedItem;
  fingerprint?: string;
  changedFields?: string[];
};
export type ImportRun = SignalRecord<{
  sourceId: string;
  sourceRevision: number;
  phase: "preview" | "committed";
  expiresAt: string;
  rows: ImportLine[];
  committedAt?: string;
}>;
export type PlanStep = {
  id: string;
  day: 30 | 60 | 90;
  title: string;
  status: "todo" | "submitted" | "done";
  report: string;
  feedback: string;
};
export type ArrivalPlan = SignalRecord<{
  offerId: string;
  candidateId: string;
  employerId: string;
  title: string;
  startDate: string;
  steps: PlanStep[];
  history: {
    at: string;
    by: string;
    action: string;
    stepId: string;
    note: string;
  }[];
}>;
export type ActionTask = {
  id: string;
  kind: "request" | "dialogue" | "plan";
  title: string;
  detail: string;
  dueAt: string;
  targetId: string;
  done: boolean;
};
export type SignalsState = {
  radars: RadarView[];
  sources: FeedSource[];
  listings: Listing[];
  imports: ImportRun[];
  plans: ArrivalPlan[];
  tasks: ActionTask[];
  generatedAt: string;
};
