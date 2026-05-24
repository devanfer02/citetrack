CREATE TABLE "source_window_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_pdf_id" integer NOT NULL,
	"page_number" integer NOT NULL,
	"window_idx" integer NOT NULL,
	"window_text" text NOT NULL,
	"embedding" "bytea" NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dim" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_window_embeddings" ADD CONSTRAINT "source_window_embeddings_source_pdf_id_source_pdfs_id_fk" FOREIGN KEY ("source_pdf_id") REFERENCES "public"."source_pdfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_window_embed_pdf_model_idx" ON "source_window_embeddings" USING btree ("source_pdf_id","embedding_model");--> statement-breakpoint
CREATE UNIQUE INDEX "source_window_embed_unique_idx" ON "source_window_embeddings" USING btree ("source_pdf_id","embedding_model","page_number","window_idx");