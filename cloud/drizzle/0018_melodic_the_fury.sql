CREATE TABLE `business_membership` (
	`user_id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`oauth_generation` text NOT NULL,
	`connected_at` integer,
	`disconnected_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_membership_business_id_unique` ON `business_membership` (`business_id`);--> statement-breakpoint
CREATE TABLE `pilot_invite` (
	`email` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
