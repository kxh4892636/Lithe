CREATE TABLE `adapter_versions` (
	`id` text PRIMARY KEY,
	`adapter_id` text NOT NULL,
	`version` integer NOT NULL,
	`definition` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_adapter_versions_adapter_id_adapters_id_fk` FOREIGN KEY (`adapter_id`) REFERENCES `adapters`(`id`)
);
--> statement-breakpoint
CREATE TABLE `adapters` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`current_version` integer NOT NULL,
	`is_deleted` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`adapter_version_id` text NOT NULL,
	`agent_session_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_tasks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_tasks_adapter_version_id_adapter_versions_id_fk` FOREIGN KEY (`adapter_version_id`) REFERENCES `adapter_versions`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adapter_versions_adapter_version_unique` ON `adapter_versions` (`adapter_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_workspace_name_unique` ON `tasks` (`workspace_id`,`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_agent_session_unique` ON `tasks` (`agent_session_id`);