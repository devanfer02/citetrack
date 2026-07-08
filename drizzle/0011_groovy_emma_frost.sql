DROP INDEX "eval_jobs_session_idx";--> statement-breakpoint
DROP INDEX "jobs_session_idx";--> statement-breakpoint
ALTER TABLE "evaluation_jobs" DROP COLUMN "session_id";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "session_id";