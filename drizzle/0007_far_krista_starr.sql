CREATE TYPE "public"."passage_batch_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "passage_match_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"batch_index" integer NOT NULL,
	"source_pdf_id" integer NOT NULL,
	"status" "passage_batch_status" DEFAULT 'pending' NOT NULL,
	"citation_count" integer NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"no_match_count" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passage_match_batches" ADD CONSTRAINT "passage_match_batches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_match_batches" ADD CONSTRAINT "passage_match_batches_source_pdf_id_source_pdfs_id_fk" FOREIGN KEY ("source_pdf_id") REFERENCES "public"."source_pdfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passage_match_batches_job_batch_idx" ON "passage_match_batches" USING btree ("job_id","batch_index");--> statement-breakpoint
CREATE INDEX "passage_match_batches_job_status_idx" ON "passage_match_batches" USING btree ("job_id","status");