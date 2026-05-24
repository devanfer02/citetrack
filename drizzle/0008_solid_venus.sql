CREATE TYPE "public"."api_call_outcome" AS ENUM('success', 'http_error', 'network_error', 'timeout');--> statement-breakpoint
CREATE TABLE "api_call_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_job_id" uuid,
	"eval_job_id" uuid,
	"provider" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"url" text NOT NULL,
	"status" integer,
	"response_headers" jsonb,
	"body_preview" text,
	"body_truncated" boolean DEFAULT false NOT NULL,
	"body_size_bytes" integer,
	"outcome" "api_call_outcome" NOT NULL,
	"error_message" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD CONSTRAINT "api_call_logs_track_job_id_jobs_id_fk" FOREIGN KEY ("track_job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD CONSTRAINT "api_call_logs_eval_job_id_evaluation_jobs_id_fk" FOREIGN KEY ("eval_job_id") REFERENCES "public"."evaluation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_call_logs_created_idx" ON "api_call_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_call_logs_provider_created_idx" ON "api_call_logs" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "api_call_logs_track_job_idx" ON "api_call_logs" USING btree ("track_job_id");--> statement-breakpoint
CREATE INDEX "api_call_logs_eval_job_idx" ON "api_call_logs" USING btree ("eval_job_id");