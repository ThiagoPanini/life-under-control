import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * Schema Drizzle do LUC. `households` e `users` são identidade/autoria
 * (ADR-0002), não autorização — esta vive na allowlist (S3). Dinheiro futuro
 * será inteiro em centavos (bigint), nunca float (CONTEXT.md #6).
 */

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
})

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    email: text("email").notNull().unique(),
    nome: text("nome").notNull(),
    // E-mail Google vinculado (issue #94) — chave de autenticação/autoria, distinta
    // do `email` nominal semeado. Nulo até o vínculo auditável (ADR-0004) ser
    // aplicado.
    googleEmail: text("google_email"),
    hue: integer("hue").notNull(),
    inicial: text("inicial").notNull(),
    // Chave do avatar no R2 (foto do Google espelhada no login, #51). Nula até o
    // 1º login bem-sucedido — o badge cai no fallback inicial+hue.
    avatarKey: text("avatar_key"),
    // WhatsApp vinculado por ato no portal (issue #152, ADR-0012) em E.164. Nulo
    // até o vínculo; a coluna É a allowlist da borda de ingestão — sem env redundante.
    whatsappPhone: text("whatsapp_phone"),
  },
  // Unicidade case-insensitive do vínculo Google (issue #94): a operação já grava
  // em minúsculas, mas o índice em `lower(...)` garante no banco que dois e-mails
  // que só diferem na caixa não coexistam — defesa-em-profundidade. NULLs múltiplos
  // são permitidos, então as duas Pessoas coexistem sem vínculo. `whatsapp_phone` é
  // E.164 (sem caixa) — unicidade direta, mesmos NULLs múltiplos permitidos.
  (t) => [
    uniqueIndex("users_google_email_lower_unique").on(sql`lower(${t.googleEmail})`),
    uniqueIndex("users_whatsapp_phone_unique").on(t.whatsappPhone),
  ],
)

/**
 * Contas de Finanças (`bills`) — tabela própria da Área (ADR-0005), não um spine
 * genérico. Guarda a *regra* (Recorrência + vencimento esperado), nunca um valor
 * (invariante #5). A união `DueRule` é desnormalizada em colunas: `due_rule_kind`
 * + (`due_rule_day` para dia-fixo · `due_rule_nth` para n-esimo-dia-util). O
 * adapter traduz colunas ⇄ união de domínio.
 */
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    icon: text("icon").notNull(),
    // Chave do logo no bucket R2 (ADR-0008); nula sem logo — `icon` é o fallback.
    logoKey: text("logo_key"),
    intervalMonths: integer("interval_months").notNull(),
    anchorMonth: integer("anchor_month"),
    dueRuleKind: text("due_rule_kind").notNull(),
    dueRuleDay: integer("due_rule_day"),
    dueRuleNth: integer("due_rule_nth"),
    dueMonthOffset: integer("due_month_offset").notNull().default(0),
    // Primeira Competência canônica (`YYYY-MM`) — onde a vigência da Conta começa
    // (#102). Backfillada pela migração aditiva 0008 (menor Competência de
    // Lançamento, ou a corrente sem histórico) antes de virar NOT NULL.
    primeiraCompetencia: text("primeira_competencia").notNull(),
    estado: text("estado").notNull().default("ativa"),
    // Data civil de encerramento (sem hora — o domínio trabalha em datas, CONTEXT
    // #3). Nula enquanto `ativa`; presente sse `encerrada` (check abaixo).
    encerradaEm: date("encerrada_em"),
  },
  // Invariantes no banco (CONTEXT.md): enums fechados e a *forma* da DueRule
  // garantidas pelo Postgres, não só pelo use-case. Persistir fato íntegro.
  (t) => [
    check("bills_estado_check", sql`${t.estado} in ('ativa', 'encerrada')`),
    // Estado e data de encerramento andam juntos: `ativa` não carrega data;
    // `encerrada` exige a data (o histórico marca quando a projeção cessou).
    check(
      "bills_encerramento_check",
      sql`(${t.estado} = 'encerrada') = (${t.encerradaEm} is not null)`,
    ),
    check(
      "bills_due_rule_kind_check",
      sql`${t.dueRuleKind} in ('dia-fixo', 'n-esimo-dia-util', 'ultimo-dia-util')`,
    ),
    check("bills_interval_months_check", sql`${t.intervalMonths} >= 1`),
    check("bills_due_month_offset_check", sql`${t.dueMonthOffset} >= 0`),
    // Primeira Competência é `ano-mês` (YYYY-MM), mês 01–12 — fato íntegro no banco.
    check(
      "bills_primeira_competencia_check",
      sql`${t.primeiraCompetencia} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    // Âncora: nula na mensal; 1–12 quando o intervalo é maior.
    check(
      "bills_recurrence_anchor_check",
      sql`(${t.intervalMonths} = 1 and ${t.anchorMonth} is null) or (${t.intervalMonths} > 1 and ${t.anchorMonth} between 1 and 12)`,
    ),
    // União discriminada: day presente sse-e-somente-se dia-fixo (1–31); nth
    // presente sse n-esimo-dia-util (1–23); ultimo-dia-util não carrega nenhum.
    check(
      "bills_due_rule_shape_check",
      sql`(${t.dueRuleKind} = 'dia-fixo') = (${t.dueRuleDay} is not null)
        and (${t.dueRuleKind} = 'n-esimo-dia-util') = (${t.dueRuleNth} is not null)
        and (${t.dueRuleDay} is null or ${t.dueRuleDay} between 1 and 31)
        and (${t.dueRuleNth} is null or ${t.dueRuleNth} between 1 and 23)`,
    ),
  ],
)

/**
 * Lançamentos de Finanças (`payments`) — tabela própria da Área (ADR-0005): o
 * fato de um pagamento, ligado a uma Conta. Guarda o valor **real** do momento
 * (inteiro em centavos, BRL — invariante #6; `bigint` por folga, nunca float), a
 * data civil de pagamento (nula só no backfill sem recibo, CONTEXT.md #3), a
 * Competência como `ano-mês` e quem pagou (autoria, não permissão — #1). Apagar a
 * Conta cascateia os Lançamentos (`on delete cascade`). Sem unicidade rígida por
 * (Conta, competência): a borda avisa no 2º, não trava (abre espaço a split).
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    // Centavos (inteiro, BRL). `bigint` com mode "number": o domínio fala number,
    // sempre dentro do seguro pra dinheiro de um Lar (#6).
    valor: bigint("valor", { mode: "number" }).notNull(),
    // Data civil do pagamento (sem hora). Nula só no backfill ("pago sem data").
    dataPagamento: date("data_pagamento"),
    competencia: text("competencia").notNull(),
    paidBy: uuid("paid_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    // Uma baixa é positiva — o "quanto" só existe quando a conta é paga (#5/#6).
    check("payments_valor_check", sql`${t.valor} > 0`),
    // Competência é `ano-mês` (YYYY-MM), mês 01–12 — o banco guarda fato íntegro.
    check("payments_competencia_check", sql`${t.competencia} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
)

/**
 * Anexos de Finanças (`attachments`) — o comprovante de um Lançamento (ADR-0008).
 * Tabela própria da Área (ADR-0005), não um spine genérico: se Saúde precisar
 * anexar um Exame depois, replica o padrão, não reabre esta. Guarda só os
 * **metadados** (os bytes vivem no R2): nome original, tipo MIME, tamanho, a
 * `chave_r2` (o endereço no bucket, `{lar}/{lançamento}/{anexo}`), quem subiu
 * (autoria, não permissão — #1) e quando. Apagar o Lançamento cascateia os Anexos
 * (`on delete cascade`); o objeto no R2 vira lixo a coletar (consequência do ADR).
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    nomeOriginal: text("nome_original").notNull(),
    tipoMime: text("tipo_mime").notNull(),
    // Tamanho em bytes (inteiro positivo). `bigint` mode "number": o domínio fala
    // number e um comprovante cabe folgado no seguro.
    tamanhoBytes: bigint("tamanho_bytes", { mode: "number" }).notNull(),
    // Endereço dos bytes no bucket R2 — único (a chave embute o uuid do Anexo).
    chaveR2: text("chave_r2").notNull().unique(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    // Instante do upload — fato persistido (CONTEXT.md #3); o adapter o serializa em ISO.
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Tamanho positivo e tipo aceito (imagem — menos SVG, que carrega script — ou
    // PDF) garantidos no banco, não só no use-case — persistir fato íntegro (CONTEXT.md).
    check("attachments_tamanho_check", sql`${t.tamanhoBytes} > 0`),
    check(
      "attachments_tipo_check",
      sql`${t.tipoMime} = 'application/pdf' or (${t.tipoMime} like 'image/%' and ${t.tipoMime} <> 'image/svg+xml')`,
    ),
  ],
)
