ALTER TABLE "users" ADD COLUMN "google_email" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_email_lower_unique" ON "users" USING btree (lower("google_email"));