-- Primeira Competência canônica da Conta (#102) — migração ADITIVA em 3 fases,
-- para não quebrar num banco com Contas já existentes (ADR-0007, cláusula de dado):
--   1. adiciona a coluna NULLABLE;
--   2. faz o backfill pela MENOR Competência de Lançamento da Conta;
--   3. para a Conta sem histórico, usa a Competência corrente da migração;
--   4. só então torna o campo NOT NULL e amarra o check de formato (YYYY-MM).
-- Encerramento não importa aqui: a menor Competência é fato do Lançamento, valha a
-- Conta ativa ou encerrada.
ALTER TABLE "bills" ADD COLUMN "primeira_competencia" text;--> statement-breakpoint
UPDATE "bills" SET "primeira_competencia" = (
	SELECT min("payments"."competencia") FROM "payments" WHERE "payments"."bill_id" = "bills"."id"
) WHERE "primeira_competencia" IS NULL;--> statement-breakpoint
UPDATE "bills" SET "primeira_competencia" = to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') WHERE "primeira_competencia" IS NULL;--> statement-breakpoint
ALTER TABLE "bills" ALTER COLUMN "primeira_competencia" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_primeira_competencia_check" CHECK ("bills"."primeira_competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
