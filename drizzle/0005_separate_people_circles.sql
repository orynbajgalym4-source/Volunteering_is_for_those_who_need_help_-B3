ALTER TABLE `group_members` ADD `membership_source` text DEFAULT 'EXPLICIT' NOT NULL;--> statement-breakpoint
UPDATE `group_members` SET `membership_source` = 'ASAR_RESPONSE' WHERE `role` = 'MEMBER';--> statement-breakpoint
ALTER TABLE `asars` ADD `time_mode` text DEFAULT 'EXACT' NOT NULL;--> statement-breakpoint
ALTER TABLE `commitments` ADD `participant_key` text;--> statement-breakpoint
CREATE INDEX `commitments_participant_idx` ON `commitments` (`participant_key`);--> statement-breakpoint
CREATE TABLE `profile_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`member_key` text NOT NULL,
	`kind` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_offers_member_kind_idx` ON `profile_offers` (`member_key`,`kind`);--> statement-breakpoint
CREATE INDEX `profile_offers_member_idx` ON `profile_offers` (`member_key`);--> statement-breakpoint
INSERT OR IGNORE INTO `profile_offers` (`id`, `member_key`, `kind`, `updated_at`)
SELECT `member_offers`.`id`, `group_members`.`member_key`, `member_offers`.`kind`, `member_offers`.`updated_at`
FROM `member_offers`
JOIN `group_members` ON `group_members`.`id` = `member_offers`.`group_member_id`;
