CREATE TYPE "public"."ledger_entry_type" AS ENUM('credit', 'debit', 'withdrawal', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_receipt_status" AS ENUM('pending', 'settled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_request_status" AS ENUM('pending', 'approved', 'rejected', 'completed');--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"api_id" text,
	"endpoint_id" text,
	"type" "ledger_entry_type" NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"platform_fee" numeric(20, 6) DEFAULT '0' NOT NULL,
	"provider_credit" numeric(20, 6) DEFAULT '0' NOT NULL,
	"request_id" text,
	"payment_tx_hash" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"request_id" text,
	"tx_hash" text,
	"network_id" text,
	"amount" numeric(20, 6) NOT NULL,
	"status" "payment_receipt_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"available_balance" numeric(20, 6) DEFAULT '0' NOT NULL,
	"pending_balance" numeric(20, 6) DEFAULT '0' NOT NULL,
	"total_withdrawn" numeric(20, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_balance_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "withdrawal_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"wallet_address" text NOT NULL,
	"status" "withdrawal_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_api_id_provider_api_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."provider_api"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_endpoint_id_provider_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."provider_endpoint"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_balance" ADD CONSTRAINT "user_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_request" ADD CONSTRAINT "withdrawal_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entry_user_id_idx" ON "ledger_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_api_id_idx" ON "ledger_entry" USING btree ("api_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_type_idx" ON "ledger_entry" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ledger_entry_created_at_idx" ON "ledger_entry" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_receipt_payment_id_idx" ON "payment_receipt" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_receipt_tx_hash_idx" ON "payment_receipt" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "payment_receipt_status_idx" ON "payment_receipt" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_balance_user_id_idx" ON "user_balance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "withdrawal_request_user_id_idx" ON "withdrawal_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "withdrawal_request_status_idx" ON "withdrawal_request" USING btree ("status");