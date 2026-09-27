CREATE TABLE "shared_knowledge" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_knowledge" ADD CONSTRAINT "shared_knowledge_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_knowledge_category_idx" ON "shared_knowledge" USING btree ("category");
