CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"nome_original" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"chave_r2" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_chave_r2_unique" UNIQUE("chave_r2"),
	CONSTRAINT "attachments_tamanho_check" CHECK ("attachments"."tamanho_bytes" > 0),
	CONSTRAINT "attachments_tipo_check" CHECK ("attachments"."tipo_mime" = 'application/pdf' or ("attachments"."tipo_mime" like 'image/%' and "attachments"."tipo_mime" <> 'image/svg+xml'))
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;