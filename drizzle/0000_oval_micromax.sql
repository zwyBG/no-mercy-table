CREATE TABLE `presence` (
	`room` text NOT NULL,
	`player` text NOT NULL,
	`seen` integer NOT NULL,
	PRIMARY KEY(`room`, `player`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL
);
