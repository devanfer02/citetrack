ALTER TABLE "evaluation_jobs" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "session_id" uuid;--> statement-breakpoint
CREATE INDEX "eval_jobs_session_idx" ON "evaluation_jobs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "jobs_session_idx" ON "jobs" USING btree ("session_id");