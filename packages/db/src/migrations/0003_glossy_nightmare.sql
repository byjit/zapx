-- Money-integrity hardening: append-only ledger references, exact fee split,
-- non-negative balance checks, per-credit request_id uniqueness, payout tx trail.
--
-- PRECONDITIONS on an existing database — these constraints validate existing
-- rows and will abort if any are violated. Check before applying:
--   1. ledger_entry_credit_split_exact
--      SELECT * FROM ledger_entry
--       WHERE type = 'credit' AND platform_fee + provider_credit <> amount;
--      Rows here were written by the old independently-rounded split and are off
--      by +0.000001. Correct them (e.g. set provider_credit = amount - platform_fee)
--      before migrating.
--   2. ledger_entry_credit_request_id_idx
--      SELECT request_id FROM ledger_entry WHERE type = 'credit'
--       GROUP BY request_id HAVING count(*) > 1;
--      Duplicates are double-credited payments and must be reconciled first.
--   3. user_balance_* / withdrawal_request_amount_positive
--      Any negative balance or non-positive withdrawal amount must be corrected.
--
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_api_id_provider_api_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_endpoint_id_provider_endpoint_id_fk";
--> statement-breakpoint
ALTER TABLE "withdrawal_request" DROP CONSTRAINT "withdrawal_request_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD COLUMN "api_id" text;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD COLUMN "endpoint_id" text;--> statement-breakpoint
ALTER TABLE "withdrawal_request" ADD COLUMN "payout_tx_hash" text;--> statement-breakpoint
ALTER TABLE "withdrawal_request" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_api_id_provider_api_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."provider_api"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_endpoint_id_provider_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."provider_endpoint"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_api_id_provider_api_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."provider_api"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_endpoint_id_provider_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."provider_endpoint"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_request" ADD CONSTRAINT "withdrawal_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entry_credit_request_id_idx" ON "ledger_entry" USING btree ("request_id") WHERE "ledger_entry"."type" = 'credit';--> statement-breakpoint
CREATE INDEX "payment_receipt_user_id_idx" ON "payment_receipt" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_amount_non_negative" CHECK ("ledger_entry"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_fee_non_negative" CHECK ("ledger_entry"."platform_fee" >= 0);--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_credit_non_negative" CHECK ("ledger_entry"."provider_credit" >= 0);--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_credit_split_exact" CHECK ("ledger_entry"."type" <> 'credit' OR "ledger_entry"."platform_fee" + "ledger_entry"."provider_credit" = "ledger_entry"."amount");--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_amount_non_negative" CHECK ("payment_receipt"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "user_balance" ADD CONSTRAINT "user_balance_available_non_negative" CHECK ("user_balance"."available_balance" >= 0);--> statement-breakpoint
ALTER TABLE "user_balance" ADD CONSTRAINT "user_balance_pending_non_negative" CHECK ("user_balance"."pending_balance" >= 0);--> statement-breakpoint
ALTER TABLE "user_balance" ADD CONSTRAINT "user_balance_withdrawn_non_negative" CHECK ("user_balance"."total_withdrawn" >= 0);--> statement-breakpoint
ALTER TABLE "withdrawal_request" ADD CONSTRAINT "withdrawal_request_amount_positive" CHECK ("withdrawal_request"."amount" > 0);