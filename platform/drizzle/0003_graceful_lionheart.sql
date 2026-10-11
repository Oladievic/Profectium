-- Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium.
CREATE TABLE `career_records` (
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`candidate_id` text DEFAULT '' NOT NULL,
	`employer_id` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `kind`, `id`)
);
--> statement-breakpoint
CREATE INDEX `career_candidate` ON `career_records` (`owner`,`kind`,`candidate_id`);--> statement-breakpoint
CREATE INDEX `career_employer` ON `career_records` (`owner`,`kind`,`employer_id`);