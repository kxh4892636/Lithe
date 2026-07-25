CREATE TABLE `task_attention_events` (
	`id` text PRIMARY KEY,
	`task_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_task_attention_events_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `task_run_markers` (
	`instance_id` text PRIMARY KEY,
	`task_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_task_run_markers_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `lifecycle` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `last_viewed_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `pinned_at` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspaces` (
	`id` text PRIMARY KEY,
	`project_id` text,
	`name` text NOT NULL,
	`root_path` text NOT NULL UNIQUE,
	`git_branch` text,
	`kind` text NOT NULL,
	`pinned_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_workspaces_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_workspaces`(`id`, `project_id`, `name`, `root_path`, `git_branch`, `kind`, `created_at`) SELECT `id`, `project_id`, `name`, `root_path`, `git_branch`, `kind`, `created_at` FROM `workspaces`;--> statement-breakpoint
DROP TABLE `workspaces`;--> statement-breakpoint
ALTER TABLE `__new_workspaces` RENAME TO `workspaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `task_attention_events_task_created_idx` ON `task_attention_events` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_run_markers_task_idx` ON `task_run_markers` (`task_id`);