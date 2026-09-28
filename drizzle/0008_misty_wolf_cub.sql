CREATE TABLE "eda_module_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" text NOT NULL,
	"version" text NOT NULL,
	"package_sha256" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"payloads_base64" jsonb NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eda_module_versions" ADD CONSTRAINT "eda_module_versions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eda_module_versions" ADD CONSTRAINT "eda_module_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eda_module_versions_identity_uidx" ON "eda_module_versions" USING btree ("module_id","version");--> statement-breakpoint
CREATE INDEX "eda_module_versions_status_idx" ON "eda_module_versions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "eda_module_versions" ADD CONSTRAINT "eda_module_versions_review_gate" CHECK (
  status IN ('pending', 'published', 'rejected', 'disabled') AND (
    status <> 'published' OR (
      manifest->>'verification' IN ('pending-review', 'reviewed') AND module_id NOT LIKE 'sample.%'
      AND reviewed_by IS NOT NULL AND reviewed_by <> submitted_by
      AND review_reference IS NOT NULL AND length(trim(review_reference)) > 0 AND reviewed_at IS NOT NULL
    )
  )
);--> statement-breakpoint
CREATE FUNCTION eda_module_versions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.module_id IS DISTINCT FROM OLD.module_id OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.package_sha256 IS DISTINCT FROM OLD.package_sha256 OR NEW.manifest IS DISTINCT FROM OLD.manifest
    OR NEW.payloads_base64 IS DISTINCT FROM OLD.payloads_base64 OR NEW.definition IS DISTINCT FROM OLD.definition
    OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
    RAISE EXCEPTION 'native module version source is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER eda_module_versions_immutable_trigger BEFORE UPDATE ON eda_module_versions
FOR EACH ROW EXECUTE FUNCTION eda_module_versions_immutable();
