CREATE TYPE "public"."iou_status" AS ENUM('pending_acceptance', 'open', 'settled', 'declined', 'cancelled', 'forgiven');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'iou_proposed' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'iou_created' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'iou_accepted' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'iou_declined' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'iou_paid' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'iou_forgiven' BEFORE 'pin_reset';--> statement-breakpoint
ALTER TYPE "public"."transaction_category" ADD VALUE 'iou' BEFORE 'adjustment';--> statement-breakpoint
CREATE TABLE "iou_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iou_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"out_transaction_id" uuid,
	"in_transaction_id" uuid,
	"paid_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ious" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"debtor_user_id" uuid NOT NULL,
	"creditor_user_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"amount_minor" bigint NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"due_date" text,
	"status" "iou_status" DEFAULT 'pending_acceptance' NOT NULL,
	"accepted_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iou_payments" ADD CONSTRAINT "iou_payments_iou_id_ious_id_fk" FOREIGN KEY ("iou_id") REFERENCES "public"."ious"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iou_payments" ADD CONSTRAINT "iou_payments_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iou_payments" ADD CONSTRAINT "iou_payments_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iou_payments" ADD CONSTRAINT "iou_payments_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iou_payments" ADD CONSTRAINT "iou_payments_out_transaction_id_transactions_id_fk" FOREIGN KEY ("out_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iou_payments" ADD CONSTRAINT "iou_payments_in_transaction_id_transactions_id_fk" FOREIGN KEY ("in_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iou_payments" ADD CONSTRAINT "iou_payments_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ious" ADD CONSTRAINT "ious_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ious" ADD CONSTRAINT "ious_debtor_user_id_users_id_fk" FOREIGN KEY ("debtor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ious" ADD CONSTRAINT "ious_creditor_user_id_users_id_fk" FOREIGN KEY ("creditor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ious" ADD CONSTRAINT "ious_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ious" ADD CONSTRAINT "ious_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "iou_payments_iou_idx" ON "iou_payments" USING btree ("iou_id","created_at");--> statement-breakpoint
CREATE INDEX "ious_family_status_idx" ON "ious" USING btree ("family_id","status");--> statement-breakpoint
CREATE INDEX "ious_debtor_idx" ON "ious" USING btree ("debtor_user_id","status");--> statement-breakpoint
CREATE INDEX "ious_creditor_idx" ON "ious" USING btree ("creditor_user_id","status");