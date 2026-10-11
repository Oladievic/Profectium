-- Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium.
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data_owner` text NOT NULL,
	`mode` text NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_hash` ON `api_keys` (`hash`);--> statement-breakpoint
CREATE INDEX `api_key_owner` ON `api_keys` (`owner`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`event` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_owner_time` ON `audit_events` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`full_name` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed` text
);
--> statement-breakpoint
CREATE INDEX `challenge_owner` ON `email_challenges` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `hiring_notes` (
	`owner` text NOT NULL,
	`candidate_id` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `candidate_id`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`owner` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`candidate_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`verified_at` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_email` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `rate_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `one_pending_offer`;--> statement-breakpoint
ALTER TABLE `offers` ADD `employer_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `one_pending_offer` ON `offers` (`owner`,`employer_id`,`candidate_id`,`job_id`) WHERE "offers"."status" = 'pending';--> statement-breakpoint
ALTER TABLE `jobs` ADD `employer_id` text DEFAULT '' NOT NULL;