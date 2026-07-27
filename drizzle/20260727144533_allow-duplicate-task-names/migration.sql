DROP INDEX IF EXISTS `tasks_workspace_name_unique`;--> statement-breakpoint
CREATE INDEX `tasks_workspace_name_index` ON `tasks` (`workspace_id`,`name_key`);