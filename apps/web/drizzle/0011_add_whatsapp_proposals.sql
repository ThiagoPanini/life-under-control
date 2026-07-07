CREATE TABLE "whatsapp_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"wa_message_id" text NOT NULL,
	"bytes_hash" text NOT NULL,
	"paid_by" uuid NOT NULL,
	"bill_id" uuid,
	"valor_centavos" bigint,
	"data_pagamento" date,
	"competencia" text,
	"favorecido" text,
	"staging_key" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"estado" text DEFAULT 'proposta' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_proposals_estado_check" CHECK ("whatsapp_proposals"."estado" in ('proposta', 'confirmada', 'cancelada', 'expirada')),
	CONSTRAINT "whatsapp_proposals_valor_check" CHECK ("whatsapp_proposals"."valor_centavos" is null or "whatsapp_proposals"."valor_centavos" > 0),
	CONSTRAINT "whatsapp_proposals_competencia_check" CHECK ("whatsapp_proposals"."competencia" is null or "whatsapp_proposals"."competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "whatsapp_proposals" ADD CONSTRAINT "whatsapp_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_proposals" ADD CONSTRAINT "whatsapp_proposals_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_proposals" ADD CONSTRAINT "whatsapp_proposals_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_proposals_hash_idx" ON "whatsapp_proposals" USING btree ("household_id","bytes_hash");