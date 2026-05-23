-- Absorbs the previously-untracked sidecar 0001_add_read_indexes.sql so a
-- fresh install gets the hot-read indexes, then adds two column-level
-- changes to source_pdfs for user-uploaded reference PDFs:
--   * new nullable `filename` column (original uploaded name)
--   * relax `reference_id` to nullable (auto-pair may leave it unassigned)
-- All statements are idempotent so the existing dev DB is a no-op.

CREATE INDEX IF NOT EXISTS "pages_job_page_idx" ON "pages" ("job_id", "page_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "citations_job_idx" ON "citations" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "references_job_idx" ON "references" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "citation_matches_job_key_idx" ON "citation_matches" ("job_id", "citation_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_pdfs_job_idx" ON "source_pdfs" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_pdfs_reference_idx" ON "source_pdfs" ("reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_pages_pdf_page_idx" ON "source_pages" ("source_pdf_id", "page_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_pages_job_page_idx" ON "evaluation_pages" ("eval_job_id", "page_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_findings_job_page_idx" ON "evaluation_findings" ("eval_job_id", "page_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_findings_job_cat_sev_idx" ON "evaluation_findings" ("eval_job_id", "category", "severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passage_matches_job_idx" ON "passage_matches" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passage_matches_citation_idx" ON "passage_matches" ("citation_id");--> statement-breakpoint

ALTER TABLE "source_pdfs" ADD COLUMN IF NOT EXISTS "filename" text;--> statement-breakpoint
ALTER TABLE "source_pdfs" ALTER COLUMN "reference_id" DROP NOT NULL;
