CREATE TABLE `group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`member_key` text NOT NULL,
	`display_name` text NOT NULL,
	`username` text,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_members_group_member_idx` ON `group_members` (`group_id`,`member_key`);--> statement-breakpoint
CREATE INDEX `group_members_member_idx` ON `group_members` (`member_key`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`photo_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `groups_owner_idx` ON `groups` (`owner_key`);--> statement-breakpoint
ALTER TABLE `asars` ADD `group_id` text REFERENCES groups(id);