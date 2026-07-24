CREATE TABLE `workspace_layouts` (
	`workspace_id` text PRIMARY KEY,
	`snapshot` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_workspace_layouts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE
);
