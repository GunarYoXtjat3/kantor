CREATE TABLE "history" (
	"id" serial PRIMARY KEY,
	"username" text NOT NULL,
	"type" text NOT NULL,
	"agent" text,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"username" text PRIMARY KEY,
	"pin_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "history_username_idx" ON "history" ("username","created_at");--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_username_users_username_fkey" FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE;