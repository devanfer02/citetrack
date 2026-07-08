CREATE TABLE "dictionary_lemma" (
	"word" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dictionary" ADD COLUMN "source" text DEFAULT 'kbbi-dyazincahya' NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation_findings" ADD COLUMN "verification_source" text;--> statement-breakpoint
ALTER TABLE "evaluation_jobs" ADD COLUMN "heartbeat_at" timestamp;--> statement-breakpoint
ALTER TABLE "evaluation_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "scanned_warning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "heartbeat_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;