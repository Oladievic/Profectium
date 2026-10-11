-- Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium.
CREATE TABLE `demo_accounts` (
	`owner` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`candidate_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`seed_version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `candidates` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`owner` text NOT NULL,
	`candidate_id` text NOT NULL,
	PRIMARY KEY(`owner`, `candidate_id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`digest` text DEFAULT 'seed' NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`job_id` text NOT NULL,
	`data` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`digest` text DEFAULT 'seed' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `offers_by_candidate` ON `offers` (`owner`,`candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_pending_offer` ON `offers` (`owner`,`candidate_id`,`job_id`) WHERE "offers"."status" = 'pending';