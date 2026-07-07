CREATE TABLE "whatsapp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_message_id" text NOT NULL,
	"remetente" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_events_wa_message_id_unique" UNIQUE("wa_message_id")
);
