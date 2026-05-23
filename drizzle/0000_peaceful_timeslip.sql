CREATE TYPE "public"."job_status" AS ENUM('pending', 'extracting', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"filename" text NOT NULL,
	"file_size" integer NOT NULL,
	"total_pages" integer,
	"extracted_pages" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"content" text NOT NULL,
	"char_count" integer NOT NULL,
	"low_text_density" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;