CREATE TABLE "design_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"requested_project_id" uuid,
	"requirement" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"model" text,
	"knowledge_version" text,
	"result" jsonb,
	"error" text,
	"lease_token" uuid,
	"deadline_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "design_jobs_request_uidx" ON "design_jobs" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "design_jobs_queue_idx" ON "design_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "design_jobs_project_idx" ON "design_jobs" USING btree ("project_id","created_at");