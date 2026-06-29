import { asc, eq } from "drizzle-orm"
import type { Bill, BillEstado, DueRule } from "@/core/domain/bill"
import type { BillRepo, NovaBill } from "@/core/ports/bill-repo"
import { type Db, getDb } from "./client"
import { bills } from "./schema"

/** Linha bruta da tabela `bills` (a forma do Drizzle, não a de domínio). */
type BillRow = typeof bills.$inferSelect

/** Reconstrói a união `DueRule` a partir das colunas desnormalizadas. */
function montarDueRule(row: BillRow): DueRule {
  switch (row.dueRuleKind) {
    case "dia-fixo":
      return { kind: "dia-fixo", day: row.dueRuleDay ?? 1 }
    case "n-esimo-dia-util":
      return { kind: "n-esimo-dia-util", nth: row.dueRuleNth ?? 1 }
    default:
      return { kind: "ultimo-dia-util" }
  }
}

/** Traduz uma linha do Postgres na forma de domínio `Bill`. */
function paraDominio(row: BillRow): Bill {
  return {
    id: row.id,
    householdId: row.householdId,
    nome: row.nome,
    descricao: row.descricao,
    icon: row.icon,
    recurrence: { intervalMonths: row.intervalMonths, anchorMonth: row.anchorMonth },
    dueRule: montarDueRule(row),
    dueMonthOffset: row.dueMonthOffset,
    estado: row.estado as BillEstado,
  }
}

/** Desmembra a união `DueRule` nas colunas (`day`/`nth` nulos quando não cabem). */
function colunasDaDueRule(dueRule: DueRule): {
  dueRuleKind: DueRule["kind"]
  dueRuleDay: number | null
  dueRuleNth: number | null
} {
  return {
    dueRuleKind: dueRule.kind,
    dueRuleDay: dueRule.kind === "dia-fixo" ? dueRule.day : null,
    dueRuleNth: dueRule.kind === "n-esimo-dia-util" ? dueRule.nth : null,
  }
}

/**
 * Adapter Drizzle do `BillRepo` (ADR-0003). Traduz entre a forma de domínio e as
 * colunas de `bills`. O `db` é injetável para o teste de Seam 2.
 */
export function drizzleBillRepo(db: Db = getDb()): BillRepo {
  return {
    async criarBill(nova: NovaBill): Promise<Bill> {
      const [row] = await db
        .insert(bills)
        .values({
          householdId: nova.householdId,
          nome: nova.nome,
          descricao: nova.descricao,
          icon: nova.icon,
          intervalMonths: nova.recurrence.intervalMonths,
          anchorMonth: nova.recurrence.anchorMonth,
          ...colunasDaDueRule(nova.dueRule),
          dueMonthOffset: nova.dueMonthOffset,
        })
        .returning()
      return paraDominio(row)
    },

    async listarBills(householdId: string): Promise<Bill[]> {
      const linhas = await db
        .select()
        .from(bills)
        .where(eq(bills.householdId, householdId))
        .orderBy(asc(bills.nome), asc(bills.id))
      return linhas.map(paraDominio)
    },
  }
}
