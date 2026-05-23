ALTER TYPE "public"."fetch_source" ADD VALUE 'europepmc';--> statement-breakpoint
ALTER TYPE "public"."fetch_source" ADD VALUE 'pubmed';--> statement-breakpoint
ALTER TYPE "public"."fetch_source" ADD VALUE 'arxiv';--> statement-breakpoint
CREATE TABLE "configurations" (
	"code" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluation_findings" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."evaluation_category";--> statement-breakpoint
CREATE TYPE "public"."evaluation_category" AS ENUM('kbbi', 'eyd');--> statement-breakpoint
ALTER TABLE "evaluation_findings" ALTER COLUMN "category" SET DATA TYPE "public"."evaluation_category" USING "category"::"public"."evaluation_category";--> statement-breakpoint
ALTER TABLE "source_pdfs" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation_jobs" DROP COLUMN "enable_filkom";--> statement-breakpoint
ALTER TABLE "evaluation_jobs" DROP COLUMN "filkom_done";--> statement-breakpoint
ALTER TABLE "evaluation_summary" DROP COLUMN "filkom_error_count";