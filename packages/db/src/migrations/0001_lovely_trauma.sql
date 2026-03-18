CREATE TABLE "provider_api" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"openapi_spec" text NOT NULL,
	"spec_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"api_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"operation_id" text,
	"summary" text,
	"description" text,
	"price_usdc" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_api" ADD CONSTRAINT "provider_api_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_api" ADD CONSTRAINT "provider_api_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_endpoint" ADD CONSTRAINT "provider_endpoint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_endpoint" ADD CONSTRAINT "provider_endpoint_api_id_provider_api_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."provider_api"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_api_project_id_idx" ON "provider_api" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "provider_api_user_id_idx" ON "provider_api" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "provider_endpoint_api_id_idx" ON "provider_endpoint" USING btree ("api_id");--> statement-breakpoint
CREATE INDEX "provider_endpoint_user_id_idx" ON "provider_endpoint" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_endpoint_api_method_path_idx" ON "provider_endpoint" USING btree ("api_id","method","path");