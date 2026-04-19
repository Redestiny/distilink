CREATE TABLE `password_reset_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`verification_code` text,
	`code_expiry` integer
);
--> statement-breakpoint
CREATE TABLE `pending_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`verification_code` text,
	`code_expiry` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_users_email_unique` ON `pending_users` (`email`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `verification_code`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `code_expiry`;