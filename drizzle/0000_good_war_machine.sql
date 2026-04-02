CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'preprocessing', 'classifying', 'extracting', 'mapping', 'ready_for_review', 'reviewed', 'exported');--> statement-breakpoint
CREATE TYPE "public"."mapping_method" AS ENUM('dictionary', 'claude', 'override');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('auto_approved', 'needs_review', 'reviewed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."rule_source" AS ENUM('seed', 'analyst_correction', 'claude_suggestion');--> statement-breakpoint
CREATE TYPE "public"."statement_type" AS ENUM('income_statement', 'balance_sheet', 'cash_flow', 'equity_statement');--> statement-breakpoint
CREATE TABLE "canonical_fields" (
	"canonical_field" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"statement_type" text,
	"field_group" text,
	"parent_field" text,
	"formula_rule" text,
	"supported_templates" text[]
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"classification" text DEFAULT 'digital',
	"word_count" integer DEFAULT 0,
	"section_type" text DEFAULT 'unclassified',
	"note_number" integer,
	"is_selected" boolean DEFAULT false,
	"text_content" text,
	"ocr_method" text DEFAULT 'none'
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"company_name" text,
	"report_year" integer[],
	"blob_url" text,
	"page_count" integer,
	"ocr_required" boolean DEFAULT false,
	"template_type" text,
	"classification_confidence" real,
	"currency_code" text,
	"unit_scale" text,
	"status" "document_status" DEFAULT 'uploaded',
	"page_classification_summary" jsonb,
	"statement_scopes" text[],
	"validation_results" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "extracted_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"statement_type" "statement_type" NOT NULL,
	"raw_label" text NOT NULL,
	"raw_values" jsonb,
	"page" integer,
	"section_path" text[],
	"indentation_level" integer DEFAULT 0,
	"note_ref" text,
	"is_subtotal" boolean DEFAULT false,
	"statement_scope" text DEFAULT 'unknown',
	"column_metadata" jsonb,
	"note_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mapped_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"canonical_field" text,
	"canonical_group" text,
	"parent_canonical_field" text,
	"normalized_values" jsonb,
	"normalized_currency" text,
	"normalized_unit" text,
	"mapping_method" "mapping_method",
	"mapping_confidence" real,
	"validation_results" jsonb,
	"review_status" "review_status" DEFAULT 'needs_review',
	"statement_scope" text DEFAULT 'unknown',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mapping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_type" text,
	"normalized_label" text NOT NULL,
	"context_pattern" jsonb,
	"canonical_field" text NOT NULL,
	"confidence" real DEFAULT 0.9,
	"source" "rule_source" DEFAULT 'seed',
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "note_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"note_number" integer NOT NULL,
	"note_title" text,
	"pages" integer[],
	"raw_text" text,
	"extracted_subtables" jsonb,
	"linked_row_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mapped_row_id" uuid NOT NULL,
	"old_canonical_field" text,
	"new_canonical_field" text,
	"old_value" real,
	"new_value" real,
	"reviewer" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_rows" ADD CONSTRAINT "extracted_rows_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapped_rows" ADD CONSTRAINT "mapped_rows_row_id_extracted_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."extracted_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapped_rows" ADD CONSTRAINT "mapped_rows_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_entries" ADD CONSTRAINT "note_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_overrides" ADD CONSTRAINT "review_overrides_mapped_row_id_mapped_rows_id_fk" FOREIGN KEY ("mapped_row_id") REFERENCES "public"."mapped_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_document_pages_document_id" ON "document_pages" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_documents_status" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_documents_template_type" ON "documents" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "idx_extracted_rows_document_id" ON "extracted_rows" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_extracted_rows_statement_type" ON "extracted_rows" USING btree ("statement_type");--> statement-breakpoint
CREATE INDEX "idx_mapped_rows_document_id" ON "mapped_rows" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_mapped_rows_review_status" ON "mapped_rows" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "idx_mapping_rules_label" ON "mapping_rules" USING btree ("normalized_label");--> statement-breakpoint
CREATE INDEX "idx_mapping_rules_template" ON "mapping_rules" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "idx_note_entries_document_id" ON "note_entries" USING btree ("document_id");