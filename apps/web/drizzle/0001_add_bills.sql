CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"icon" text NOT NULL,
	"interval_months" integer NOT NULL,
	"anchor_month" integer,
	"due_rule_kind" text NOT NULL,
	"due_rule_day" integer,
	"due_rule_nth" integer,
	"due_month_offset" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'ativa' NOT NULL,
	CONSTRAINT "bills_estado_check" CHECK ("bills"."estado" in ('ativa', 'encerrada')),
	CONSTRAINT "bills_due_rule_kind_check" CHECK ("bills"."due_rule_kind" in ('dia-fixo', 'n-esimo-dia-util', 'ultimo-dia-util')),
	CONSTRAINT "bills_interval_months_check" CHECK ("bills"."interval_months" >= 1),
	CONSTRAINT "bills_due_month_offset_check" CHECK ("bills"."due_month_offset" >= 0),
	CONSTRAINT "bills_recurrence_anchor_check" CHECK (("bills"."interval_months" = 1 and "bills"."anchor_month" is null) or ("bills"."interval_months" > 1 and "bills"."anchor_month" between 1 and 12)),
	CONSTRAINT "bills_due_rule_shape_check" CHECK (("bills"."due_rule_kind" = 'dia-fixo') = ("bills"."due_rule_day" is not null)
        and ("bills"."due_rule_kind" = 'n-esimo-dia-util') = ("bills"."due_rule_nth" is not null)
        and ("bills"."due_rule_day" is null or "bills"."due_rule_day" between 1 and 31)
        and ("bills"."due_rule_nth" is null or "bills"."due_rule_nth" between 1 and 23))
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;