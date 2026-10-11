-- Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium.
CREATE TABLE `assessments` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`role` text NOT NULL,
	`grade` text NOT NULL,
	`data` text NOT NULL,
	`answer_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `assessment_history` ON `assessments` (`owner`,`candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_assessment` ON `assessments` (`owner`,`candidate_id`) WHERE "assessments"."status" = 'active';--> statement-breakpoint
CREATE TABLE `companies` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
