CREATE TABLE `asars` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`owner_name` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`starts_at` text NOT NULL,
	`public_location` text NOT NULL,
	`exact_address` text NOT NULL,
	`lifecycle_status` text DEFAULT 'DRAFT' NOT NULL,
	`beneficiary_consent_confirmed` integer DEFAULT false NOT NULL,
	`outcome` text,
	`outcome_note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asars_owner_idx` ON `asars` (`owner_email`);--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`participant_name` text NOT NULL,
	`contact_type` text NOT NULL,
	`contact_value` text NOT NULL,
	`normalized_contact_hash` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'CLAIMED' NOT NULL,
	`manage_token_hash` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`confirmed_at` text,
	`attended_at` text,
	`cancelled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commitments_manage_hash_idx` ON `commitments` (`manage_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `commitments_contact_requirement_idx` ON `commitments` (`requirement_id`,`normalized_contact_hash`);--> statement-breakpoint
CREATE INDEX `commitments_requirement_idx` ON `commitments` (`requirement_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`asar_id` text NOT NULL,
	`requirement_id` text,
	`scope` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asar_id`) REFERENCES `asars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_idx` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_asar_idx` ON `invites` (`asar_id`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`asar_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`required_quantity` integer NOT NULL,
	`is_critical` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asar_id`) REFERENCES `asars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `requirements_asar_idx` ON `requirements` (`asar_id`);