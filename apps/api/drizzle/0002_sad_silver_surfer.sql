ALTER TYPE "public"."notification_type" ADD VALUE 'withdrawal' BEFORE 'allowance';--> statement-breakpoint
ALTER TYPE "public"."transaction_category" ADD VALUE 'cash' BEFORE 'interest';--> statement-breakpoint
ALTER TYPE "public"."transaction_kind" ADD VALUE 'withdrawal' BEFORE 'transfer_in';