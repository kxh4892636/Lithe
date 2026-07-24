CREATE TABLE `navigation_state` (
	`id` integer PRIMARY KEY,
	`active_workspace_id` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_navigation_state_active_workspace_id_workspaces_id_fk` FOREIGN KEY (`active_workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`root_path` text NOT NULL UNIQUE,
	`is_valid` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL UNIQUE,
	`git_branch` text,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_workspaces_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
