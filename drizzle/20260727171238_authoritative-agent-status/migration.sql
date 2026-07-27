ALTER TABLE `tasks` ADD `agent_status` text DEFAULT 'closed' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `task_run_markers_task_idx`;--> statement-breakpoint
DROP TABLE `task_run_markers`;