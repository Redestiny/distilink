ALTER TABLE password_reset_tokens ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE pending_users ADD `attempts` integer DEFAULT 0 NOT NULL;