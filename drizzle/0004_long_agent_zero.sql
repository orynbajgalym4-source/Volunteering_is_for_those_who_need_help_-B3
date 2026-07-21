CREATE TABLE `asar_offer_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`asar_id` text NOT NULL,
	`group_member_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asar_id`) REFERENCES `asars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_member_id`) REFERENCES `group_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asar_offer_snapshots_asar_member_kind_idx` ON `asar_offer_snapshots` (`asar_id`,`group_member_id`,`kind`);--> statement-breakpoint
CREATE INDEX `asar_offer_snapshots_asar_idx` ON `asar_offer_snapshots` (`asar_id`);--> statement-breakpoint
CREATE TABLE `group_member_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`asar_id` text NOT NULL,
	`group_member_id` text NOT NULL,
	`invited_by_key` text NOT NULL,
	`invited_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asar_id`) REFERENCES `asars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_member_id`) REFERENCES `group_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_member_invitations_member_idx` ON `group_member_invitations` (`group_member_id`,`invited_at`);--> statement-breakpoint
CREATE INDEX `group_member_invitations_asar_idx` ON `group_member_invitations` (`asar_id`);--> statement-breakpoint
CREATE TABLE `member_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`group_member_id` text NOT NULL,
	`kind` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_member_id`) REFERENCES `group_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_offers_member_kind_idx` ON `member_offers` (`group_member_id`,`kind`);--> statement-breakpoint
CREATE INDEX `member_offers_member_idx` ON `member_offers` (`group_member_id`);--> statement-breakpoint
ALTER TABLE `commitments` ADD `group_member_id` text REFERENCES group_members(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `commitments_group_member_idx` ON `commitments` (`group_member_id`);--> statement-breakpoint
UPDATE `commitments` SET `group_member_id` = (
	SELECT `group_members`.`id`
	FROM `group_members`
	JOIN `requirements` ON `requirements`.`id` = `commitments`.`requirement_id`
	JOIN `asars` ON `asars`.`id` = `requirements`.`asar_id`
	WHERE `group_members`.`group_id` = `asars`.`group_id`
		AND `group_members`.`member_key` = 'contact:' || `commitments`.`normalized_contact_hash`
	LIMIT 1
) WHERE `group_member_id` IS NULL;
