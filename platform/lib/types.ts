/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

export const roles = [
  "Frontend",
  "Backend",
  "Fullstack",
  "Data Science",
  "DevOps",
  "QA",
] as const;
export type Role = (typeof roles)[number];
export type Achievement = {
  id: string;
  competition: string;
  discipline: string;
  place: number;
  participants: number;
  year: number;
  teamRole: string;
  source: "mock-fsp";
};
export type Candidate = {
  controls?: import('./career-types').ProfileControls;
  incomingRules?: import('./career-types').IncomingRules;
  isAnonymous?: boolean;
  learningCompleted?: string[];
  id: string;
  fullName: string;
  initials: string;
  role: Role;
  grade: string;
  city: string;
  workFormat: string;
  salaryMin: number;
  salaryMax: number;
  yearsExperience: number;
  skills: string[];
  bio: string;
  achievements: Achievement[];
  available?: boolean;
  lastSynced?: string;
  revision?: number;
  contact?: string;
  softSkills?: string[];
  fspId?: string;
  privacy?: {
    processing: boolean;
    publication: boolean;
    showAchievements: boolean;
    consentAt?: string;
  };
  qualification?: Qualification;
};
export const grades = ["Junior", "Middle", "Senior"] as const;
export type Grade = (typeof grades)[number];
export type Qualification = {
  role: Role;
  grade: Grade;
  score: number;
  passedAt: string;
  nextChangeAt: string;
  attemptId: string;
  synthetic: boolean;
};
export type Question = {
  id: string;
  topic: string;
  prompt: string;
  kind: "general" | "professional";
  options: { id: string; text: string }[];
};
export type Assessment = {
  draftAnswers?: Record<string, string>;
  draftRevision?: number;
  rubric?: {
    minimumTotal: number;
    minimumProfessional: number;
    bankVersion: string;
  };
  id: string;
  role: Role;
  grade: Grade;
  industry: string;
  motivation: string;
  jobId?: string;
  jobTitle?: string;
  status: "active" | "passed" | "failed" | "expired";
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  score?: number;
  feedback?: { topic: string; correct: boolean }[];
  questions: Question[];
  answers?: Record<string, string>;
  blueprint: string;
};
export type Company = {
  name: string;
  industry: string;
  description: string;
  contact: string;
};
export type Job = {
  employerId?: string;
  id: string;
  title: string;
  company: string;
  role: Role;
  grade: string;
  city: string;
  workFormat: string;
  salaryMin: number;
  salaryMax: number;
  skills: string[];
  description: string;
  status: "active" | "archived";
  createdAt: string;
};
export type Offer = {
  declineReason?: string;
  hasDialogue?: boolean;
  workFormat?: string;
  coreHours?: string;
  onCall?: 'yes'|'no'|'discuss';
  employerId?: string;
  id: string;
  candidateId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  salaryMin: number;
  salaryMax: number;
  message: string;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  createdAt: string;
  updatedAt: string;
  employerContact?: string;
  candidateContact?: string;
};
export type Session = {
  role: "employer" | "candidate";
  candidateId: string;
  mode: "demo" | "live";
  revision: number;
};
export type AppState = {
  notes: HiringNote[];
  candidates: Candidate[];
  jobs: Job[];
  offers: Offer[];
  favorites: string[];
  session: Session;
  assessments: Assessment[];
  company: Company;
  demoPersonas: { id: string; fullName: string }[];
};
export type HiringNote = {
  candidateId: string;
  stage: "shortlist" | "screening" | "interview" | "decision";
  text: string;
  revision: number;
  updatedAt: string;
};
export type Filters = {
  query: string;
  role: string;
  grade: string;
  format: string;
  maxSalary: string;
  hasAchievements: boolean;
  discipline: string;
  jobId: string;
  sort: string;
};
export const defaultFilters: Filters = {
  query: "",
  role: "all",
  grade: "all",
  format: "all",
  maxSalary: "",
  hasAchievements: false,
  discipline: "all",
  jobId: "all",
  sort: "relevance",
};
