-- Hot-read indexes: every query listed in the file header is a
-- WHERE ... = $1 or WHERE ... = $1 AND ... = $2 pattern that was
-- previously doing a sequential scan.

CREATE INDEX IF NOT EXISTS "pages_job_page_idx" ON "pages" ("job_id", "page_number");
CREATE INDEX IF NOT EXISTS "citations_job_idx" ON "citations" ("job_id");
CREATE INDEX IF NOT EXISTS "references_job_idx" ON "references" ("job_id");
CREATE INDEX IF NOT EXISTS "citation_matches_job_key_idx" ON "citation_matches" ("job_id", "citation_key");
CREATE INDEX IF NOT EXISTS "source_pdfs_job_idx" ON "source_pdfs" ("job_id");
CREATE INDEX IF NOT EXISTS "source_pdfs_reference_idx" ON "source_pdfs" ("reference_id");
CREATE INDEX IF NOT EXISTS "source_pages_pdf_page_idx" ON "source_pages" ("source_pdf_id", "page_number");
CREATE INDEX IF NOT EXISTS "evaluation_pages_job_page_idx" ON "evaluation_pages" ("eval_job_id", "page_number");
CREATE INDEX IF NOT EXISTS "evaluation_findings_job_page_idx" ON "evaluation_findings" ("eval_job_id", "page_number");
CREATE INDEX IF NOT EXISTS "evaluation_findings_job_cat_sev_idx" ON "evaluation_findings" ("eval_job_id", "category", "severity");
CREATE INDEX IF NOT EXISTS "passage_matches_job_idx" ON "passage_matches" ("job_id");
CREATE INDEX IF NOT EXISTS "passage_matches_citation_idx" ON "passage_matches" ("citation_id");
