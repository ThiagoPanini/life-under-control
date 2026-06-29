import { sql } from "drizzle-orm"
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core"

/**
 * Schema Drizzle do LUC. `households` e `users` são identidade/autoria
 * (ADR-0002), não autorização — esta vive na allowlist (S3). Dinheiro futuro
 * será inteiro em centavos (bigint), nunca float (CONTEXT.md #6).
 */

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
})

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  email: text("email").notNull().unique(),
  nome: text("nome").notNull(),
  hue: integer("hue").notNull(),
  inicial: text("inicial").notNull(),
})

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
    intervalMonths: integer("interval_months").notNull(),
    anchorMonth: integer("anchor_month"),
    dueRuleKind: text("due_rule_kind").notNull(),
    dueRuleDay: integer("due_rule_day"),
    dueRuleNth: integer("due_rule_nth"),
    dueMonthOffset: integer("due_month_offset").notNull().default(0),
    estado: text("estado").notNull().default("ativa"),
  },
  // Invariantes no banco (CONTEXT.md): enums fechados e a *forma* da DueRule
  // garantidas pelo Postgres, não só pelo use-case. Persistir fato íntegro.
  (t) => [
    check("bills_estado_check", sql`${t.estado} in ('ativa', 'encerrada')`),
    check(
      "bills_due_rule_kind_check",
      sql`${t.dueRuleKind} in ('dia-fixo', 'n-esimo-dia-util', 'ultimo-dia-util')`,
    ),
    check("bills_interval_months_check", sql`${t.intervalMonths} >= 1`),
    check("bills_due_month_offset_check", sql`${t.dueMonthOffset} >= 0`),
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
