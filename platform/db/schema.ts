/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const accounts = sqliteTable("demo_accounts", {
  owner: text("owner").primaryKey(),
  role: text("role").notNull(),
  candidateId: text("candidate_id").notNull(),
  revision: integer("revision").notNull().default(0),
  seedVersion: integer("seed_version").notNull().default(1),
});
export const candidates = sqliteTable(
  "candidates",
  {
    owner: text("owner").notNull(),
    id: text("id").notNull(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.owner, t.id] })],
);
export const jobs = sqliteTable(
  "jobs",
  {
    owner: text("owner").notNull(),
    employerId: text("employer_id").notNull().default(""),
    id: text("id").notNull(),
    data: text("data").notNull(),
    digest: text("digest").notNull().default("seed"),
  },
  (t) => [primaryKey({ columns: [t.owner, t.id] })],
);
export const favorites = sqliteTable(
  "favorites",
  {
    owner: text("owner").notNull(),
    candidateId: text("candidate_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.candidateId] })],
);
export const offers = sqliteTable(
  "offers",
  {
    owner: text("owner").notNull(),
    employerId: text("employer_id").notNull().default(""),
    id: text("id").notNull(),
    candidateId: text("candidate_id").notNull(),
    jobId: text("job_id").notNull(),
    data: text("data").notNull(),
    status: text("status").notNull().default("pending"),
    digest: text("digest").notNull().default("seed"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.id] }),
    index("offers_by_candidate").on(t.owner, t.candidateId),
    uniqueIndex("one_pending_offer")
      .on(t.owner, t.employerId, t.candidateId, t.jobId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
export const assessments = sqliteTable(
  "assessments",
  {
    owner: text("owner").notNull(),
    id: text("id").notNull(),
    candidateId: text("candidate_id").notNull(),
    role: text("role").notNull(),
    grade: text("grade").notNull(),
    data: text("data").notNull(),
    answerKey: text("answer_key").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.id] }),
    index("assessment_history").on(t.owner, t.candidateId),
    uniqueIndex("one_active_assessment")
      .on(t.owner, t.candidateId)
      .where(sql`${t.status} = 'active'`),
  ],
);
export const companies = sqliteTable("companies", {
  owner: text("owner").primaryKey(),
  data: text("data").notNull(),
});
export const members = sqliteTable(
  "members",
  {
    owner: text("owner").primaryKey(),
    role: text("role").notNull(),
    candidateId: text("candidate_id").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    verifiedAt: text("verified_at").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [uniqueIndex("member_email").on(t.email)],
);
export const emailChallenges = sqliteTable(
  "email_challenges",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    fullName: text("full_name").notNull(),
    codeHash: text("code_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumed: text("consumed"),
  },
  (t) => [index("challenge_owner").on(t.owner, t.createdAt)],
);
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    dataOwner: text("data_owner").notNull(),
    mode: text("mode").notNull(),
    name: text("name").notNull(),
    hash: text("hash").notNull(),
    scopes: text("scopes").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [
    uniqueIndex("api_key_hash").on(t.hash),
    index("api_key_owner").on(t.owner),
  ],
);
export const rateBuckets = sqliteTable("rate_buckets", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: text("expires_at").notNull(),
});
export const hiringNotes = sqliteTable(
  "hiring_notes",
  {
    owner: text("owner").notNull(),
    candidateId: text("candidate_id").notNull(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.owner, t.candidateId] })],
);
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    event: text("event").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_owner_time").on(t.owner, t.createdAt)],
);
export const careerRecords = sqliteTable('career_records',{
  owner:text('owner').notNull(), kind:text('kind').notNull(), id:text('id').notNull(),
  candidateId:text('candidate_id').notNull().default(''), employerId:text('employer_id').notNull().default(''),
  data:text('data').notNull(), revision:integer('revision').notNull().default(0), createdAt:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.owner,t.kind,t.id]}),index('career_candidate').on(t.owner,t.kind,t.candidateId),index('career_employer').on(t.owner,t.kind,t.employerId)]);

export const publicUsers = sqliteTable("public_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull(),
  guest: integer("guest").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("public_user_email").on(t.email)]);

export const publicSessions = sqliteTable("public_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => publicUsers.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
}, (t) => [index("public_session_user").on(t.userId), index("public_session_expiry").on(t.expiresAt)]);
