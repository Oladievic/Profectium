-- Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium.
CREATE TABLE `public_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `public_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `public_session_user` ON `public_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `public_session_expiry` ON `public_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `public_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`password_hash` text,
	`role` text NOT NULL,
	`guest` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_user_email` ON `public_users` (`email`);