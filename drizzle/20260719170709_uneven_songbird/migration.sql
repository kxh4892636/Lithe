CREATE TABLE `app_preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `window_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`is_maximized` integer NOT NULL,
	`updated_at` integer NOT NULL
);
