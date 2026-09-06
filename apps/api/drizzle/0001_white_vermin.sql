ALTER TYPE "public"."notification_type" ADD VALUE 'peer_transfer' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'peer_request_received' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'peer_request_approved' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'peer_request_declined' BEFORE 'pin_reset';--> statement-breakpoint
CREATE TABLE "peer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"requester_account_id" uuid NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"payer_account_id" uuid,
	"amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"payer_transaction_id" uuid,
	"requester_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "peer_requests" ADD CONSTRAINT "peer_requests_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_requests" ADD CONSTRAINT "peer_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_requests" ADD CONSTRAINT "peer_requests_requester_account_id_accounts_id_fk" FOREIGN KEY ("requester_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_requests" ADD CONSTRAINT "peer_requests_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_requests" ADD CONSTRAINT "peer_requests_payer_account_id_accounts_id_fk" FOREIGN KEY ("payer_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_requests" ADD CONSTRAINT "peer_requests_payer_transaction_id_transactions_id_fk" FOREIGN KEY ("payer_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_requests" ADD CONSTRAINT "peer_requests_requester_transaction_id_transactions_id_fk" FOREIGN KEY ("requester_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "peer_requests_family_status_idx" ON "peer_requests" USING btree ("family_id","status");--> statement-breakpoint
CREATE INDEX "peer_requests_payer_idx" ON "peer_requests" USING btree ("payer_user_id","status");--> statement-breakpoint
CREATE INDEX "peer_requests_requester_idx" ON "peer_requests" USING btree ("requester_user_id","status");