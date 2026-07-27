-- Preserve existing Adapter versions and every task reference while replacing the version ID.
CREATE TABLE `__new_adapter_versions` (
	`adapter_id` text NOT NULL,
	`version` integer NOT NULL,
	`definition` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`adapter_id`, `version`),
	FOREIGN KEY (`adapter_id`) REFERENCES `adapters`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_adapter_versions` (`adapter_id`, `version`, `definition`, `created_at`)
SELECT `adapter_id`, `version`, `definition`, `created_at`
FROM `adapter_versions`;
--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`adapter_id` text NOT NULL,
	`adapter_version` integer NOT NULL,
	`agent_status` text DEFAULT 'closed' NOT NULL,
	`agent_session_id` text,
	`lifecycle` text DEFAULT 'active' NOT NULL,
	`archived_at` integer,
	`last_viewed_at` integer,
	`should_auto_restore` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`adapter_id`, `adapter_version`) REFERENCES `__new_adapter_versions`(`adapter_id`, `version`)
);
--> statement-breakpoint
INSERT INTO `__new_tasks` (
	`id`,
	`workspace_id`,
	`name`,
	`name_key`,
	`adapter_id`,
	`adapter_version`,
	`agent_status`,
	`agent_session_id`,
	`lifecycle`,
	`archived_at`,
	`last_viewed_at`,
	`should_auto_restore`,
	`created_at`
)
SELECT
	`tasks`.`id`,
	`tasks`.`workspace_id`,
	`tasks`.`name`,
	`tasks`.`name_key`,
	`adapter_versions`.`adapter_id`,
	`adapter_versions`.`version`,
	`tasks`.`agent_status`,
	`tasks`.`agent_session_id`,
	`tasks`.`lifecycle`,
	`tasks`.`archived_at`,
	`tasks`.`last_viewed_at`,
	`tasks`.`should_auto_restore`,
	`tasks`.`created_at`
FROM `tasks`
INNER JOIN `adapter_versions` ON `adapter_versions`.`id` = `tasks`.`adapter_version_id`;
--> statement-breakpoint
INSERT INTO `app_preferences` (`key`, `value`, `updated_at`)
SELECT 'default-adapter', `adapter_versions`.`adapter_id`, `app_preferences`.`updated_at`
FROM `app_preferences`
INNER JOIN `adapter_versions` ON `adapter_versions`.`id` = `app_preferences`.`value`
WHERE `app_preferences`.`key` = 'default-adapter-version'
ON CONFLICT(`key`) DO UPDATE SET
	`value` = excluded.`value`,
	`updated_at` = excluded.`updated_at`;
--> statement-breakpoint
DELETE FROM `app_preferences` WHERE `key` = 'default-adapter-version';
--> statement-breakpoint
CREATE TABLE `__task_attention_events_backup` AS
SELECT `id`, `task_id`, `created_at`
FROM `task_attention_events`;
--> statement-breakpoint
DROP TABLE `task_attention_events`;
--> statement-breakpoint
DROP TABLE `tasks`;
--> statement-breakpoint
DROP TABLE `adapter_versions`;
--> statement-breakpoint
ALTER TABLE `__new_adapter_versions` RENAME TO `adapter_versions`;
--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;
--> statement-breakpoint
CREATE INDEX `tasks_workspace_name_index` ON `tasks` (`workspace_id`, `name_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_agent_session_unique` ON `tasks` (`agent_session_id`);
--> statement-breakpoint
CREATE TABLE `task_attention_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `task_attention_events` (`id`, `task_id`, `created_at`)
SELECT `id`, `task_id`, `created_at`
FROM `__task_attention_events_backup`;
--> statement-breakpoint
DROP TABLE `__task_attention_events_backup`;
--> statement-breakpoint
CREATE INDEX `task_attention_events_task_created_idx`
ON `task_attention_events` (`task_id`, `created_at`);
