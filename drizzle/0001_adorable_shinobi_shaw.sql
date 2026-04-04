ALTER TABLE "document_pages" ADD COLUMN "secondary_section_type" text;--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "classification_confidence" real;--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "heading_verbatim" text;