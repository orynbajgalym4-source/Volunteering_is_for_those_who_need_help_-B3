CREATE TABLE `reconfirmation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`request_id` text NOT NULL,
	`commitment_id` text NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`responded_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `reconfirmation_rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `reconfirmation_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconfirmation_items_round_commitment_idx` ON `reconfirmation_items` (`round_id`,`commitment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reconfirmation_items_request_commitment_idx` ON `reconfirmation_items` (`request_id`,`commitment_id`);--> statement-breakpoint
CREATE INDEX `reconfirmation_items_request_idx` ON `reconfirmation_items` (`request_id`);--> statement-breakpoint
CREATE INDEX `reconfirmation_items_commitment_idx` ON `reconfirmation_items` (`commitment_id`);--> statement-breakpoint
CREATE TABLE `reconfirmation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`participant_ref` text NOT NULL,
	`participant_key` text,
	`normalized_contact_hash` text NOT NULL,
	`participant_name` text NOT NULL,
	`contact_type` text NOT NULL,
	`contact_value` text NOT NULL,
	`delivery_status` text DEFAULT 'PENDING' NOT NULL,
	`token_hash` text,
	`token_issued_at` text,
	`delivery_attempts` integer DEFAULT 0 NOT NULL,
	`reminder_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`last_sent_at` text,
	`opened_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `reconfirmation_rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconfirmation_requests_round_participant_idx` ON `reconfirmation_requests` (`round_id`,`participant_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `reconfirmation_requests_token_hash_idx` ON `reconfirmation_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `reconfirmation_requests_round_idx` ON `reconfirmation_requests` (`round_id`);--> statement-breakpoint
CREATE INDEX `reconfirmation_requests_participant_idx` ON `reconfirmation_requests` (`participant_key`);--> statement-breakpoint
CREATE TABLE `reconfirmation_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`asar_id` text NOT NULL,
	`organizer_key` text NOT NULL,
	`schedule_key` text NOT NULL,
	`starts_at` text NOT NULL,
	`time_mode` text NOT NULL,
	`expires_at` text NOT NULL,
	`closed_at` text,
	`close_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asar_id`) REFERENCES `asars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconfirmation_rounds_asar_schedule_idx` ON `reconfirmation_rounds` (`asar_id`,`schedule_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `reconfirmation_rounds_active_asar_idx` ON `reconfirmation_rounds` (`asar_id`) WHERE "reconfirmation_rounds"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX `reconfirmation_rounds_asar_idx` ON `reconfirmation_rounds` (`asar_id`);--> statement-breakpoint
ALTER TABLE `commitments` ADD `reminder_opt_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
