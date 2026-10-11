/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import type { Role, Grade, Candidate } from "./types";
export type Proof = {
  revision?: number;
  id: string;
  candidateId: string;
  title: string;
  skill: string;
  kind: "self" | "assessment" | "competition" | "case";
  summary: string;
  artifact: string;
  source: string;
  status: "claimed" | "recorded" | "evaluated";
  createdAt: string;
  published: boolean;
  synthetic: boolean;
  limits: string;
  score?: number;
};
export type IncomingRules = {
  minimumSalary: number;
  formats: string[];
  coreHours: string;
  onCall: "yes" | "no" | "discuss";
  strict: boolean;
  interests: string[];
};
export type ProfileControls = { anonymous: boolean; rules: IncomingRules };
export type Brief = {
  id: string;
  title: string;
  role: Role;
  /** Older saved needs have no grade; never infer one from their title. */
  grade?: Grade;
  outcomes: string[];
  mandatory: string[];
  desirable: string[];
  trainable: string[];
  salaryMin: number;
  salaryMax: number;
  workFormat: string;
  coreHours: string;
  onCall: "yes" | "no" | "discuss";
  coveredSkills: string[];
  revision: number;
  updatedAt: string;
};
export type CareerRecord<T> = T & {
  id: string;
  revision: number;
  createdAt: string;
  candidateId: string;
  employerId: string;
};
export type Verification = CareerRecord<{
  skill: string;
  title: string;
  criteria: string;
  estimatedMinutes: number;
  dueAt: string;
  state: "requested" | "submitted" | "reviewed" | "declined" | "cancelled";
  response: string;
  proofId: string;
  feedback: string;
  decision: "confirmed" | "more-evidence" | "";
}>;
export type Grant = CareerRecord<{
  fields: ("identity" | "artifacts")[];
  expiresAt: string;
  revoked: boolean;
  recipientName: string;
}>;
export type Terms = {
  salaryMin: number;
  salaryMax: number;
  workFormat: string;
  coreHours: string;
  onCall: "yes" | "no" | "discuss";
  firstMonths: string;
  interviewSteps: string;
  reviewProcess: string;
  mentoring: string;
};
export type Dialogue = CareerRecord<{
  offerId: string;
  terms: Terms;
  turn: "employer" | "candidate";
  agreed: boolean;
  versions: {
    version: number;
    by: "employer" | "candidate";
    at: string;
    terms: Terms;
    note: string;
  }[];
  events: {
    id: string;
    at: string;
    by: "employer" | "candidate";
    kind: "message" | "step" | "feedback" | "agreement";
    text: string;
    dueAt?: string;
  }[];
}>;
export type LabCase = {
  skill: string;
  id: string;
  role: Role;
  title: string;
  summary: string;
  scenario: string;
  artifact: string;
  requirements: string[];
  estimatedMinutes: number;
  decisions: {
    id: string;
    prompt: string;
    options: { id: string; label: string; patch: string }[];
  }[];
  rubric: { id: string; label: string; maxPoints: number }[];
};
export type LabRun = CareerRecord<{
  caseId: string;
  caseTitle: string;
  answers: Record<string, string>;
  explanation: string;
  artifact: string;
  score: number;
  feedback: { prompt: string; correct: boolean; explanation: string }[];
  executedCode: false;
}>;
export type CareerState = {
  briefs: Brief[];
  proofs: Proof[];
  requests: Verification[];
  grants: Grant[];
  runs: LabRun[];
  dialogues: Dialogue[];
  recipients: { id: string; name: string }[];
  controls: ProfileControls | null;
  candidateRevision: number;
  views: { id: string; at: string; employer: string; candidateId: string }[];
};
export type RequirementMatch = {
  skill: string;
  status: "evidence" | "declared" | "missing" | "covered";
  proofIds: string[];
};
export type BriefMatch = {
  candidate: Candidate;
  requirements: RequirementMatch[];
  missing: string[];
  conditions: string[];
  desired: number;
  evidenceCount: number;
  compatible: boolean;
};
export const emptyRules: IncomingRules = {
  minimumSalary: 0,
  formats: [],
  coreHours: "",
  onCall: "discuss",
  strict: false,
  interests: [],
};
