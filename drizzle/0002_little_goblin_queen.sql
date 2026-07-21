CREATE TABLE `user_preferences` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`bot_messages_allowed` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
