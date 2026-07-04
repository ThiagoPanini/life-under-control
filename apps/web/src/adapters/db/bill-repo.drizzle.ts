import { and, asc, count, eq } from "drizzle-orm"
import type { Bill, BillEstado, DadosBill, DueRule } from "@/core/domain/bill"
import type { BillRepo, DependentesBill, NovaBill } from "@/core/ports/bill-repo"
import { type Db, getDb } from "./client"
import { attachments, bills, payments } from "./schema"

/** Linha bruta da tabela `bills` (a forma do Drizzle, não a de domínio). */
type BillRow = typeof bills.$inferSelect

/** Conta os Lançamentos de uma Conta do Lar (dependentes que a exclusão leva). */
async function contarLancamentos(db: Db, householdId: string, billId: string): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(payments)
    .where(and(eq(payments.householdId, householdId), eq(payments.billId, billId)))
  return Number(linha?.n ?? 0)
}

/** Conta os Anexos de uma Conta do Lar (via os Lançamentos) — o cascade os leva junto. */
async function contarAttachments(db: Db, householdId: string, billId: string): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(attachments)
    .innerJoin(payments, eq(attachments.paymentId, payments.id))
    .where(and(eq(payments.householdId, householdId), eq(payments.billId, billId)))
  return Number(linha?.n ?? 0)
}

/** Conta Lançamentos e Anexos de uma Conta em paralelo (o que a exclusão leva junto). */
async function contarDependentesDe(
  db: Db,
  householdId: string,
  billId: string,
): Promise<DependentesBill> {
  const [lancamentos, anexos] = await Promise.all([
    contarLancamentos(db, householdId, billId),
    contarAttachments(db, householdId, billId),
  ])
  return { lancamentos, anexos }
}

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
    primeiraCompetencia: row.primeiraCompetencia,
    estado: row.estado as BillEstado,
    encerradaEm: row.encerradaEm,
    logoKey: row.logoKey,
  }
}

/** Desmembra os `DadosBill` validados nas colunas de `bills` (regra, sem estado). */
function colunasDosDados(dados: DadosBill) {
  return {
    nome: dados.nome,
    descricao: dados.descricao,
    icon: dados.icon,
    intervalMonths: dados.recurrence.intervalMonths,
    anchorMonth: dados.recurrence.anchorMonth,
    ...colunasDaDueRule(dados.dueRule),
    dueMonthOffset: dados.dueMonthOffset,
    primeiraCompetencia: dados.primeiraCompetencia,
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
        .values({ householdId: nova.householdId, ...colunasDosDados(nova) })
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

    async obterBill(householdId: string, billId: string): Promise<Bill | null> {
      const [row] = await db
        .select()
        .from(bills)
        .where(and(eq(bills.householdId, householdId), eq(bills.id, billId)))
      return row ? paraDominio(row) : null
    },

    async editarBill(householdId: string, billId: string, dados: DadosBill): Promise<Bill | null> {
      const [row] = await db
        .update(bills)
        .set(colunasDosDados(dados))
        .where(and(eq(bills.householdId, householdId), eq(bills.id, billId)))
        .returning()
      return row ? paraDominio(row) : null
    },

    async encerrarBill(
      householdId: string,
      billId: string,
      encerradaEm: string,
    ): Promise<Bill | null> {
      // `estado = 'ativa'` no WHERE torna o encerramento atômico e idempotente-seguro:
      // um segundo encerrar (forma obsoleta, corrida de acesso simétrico) não acha
      // linha ativa e devolve null, nunca reescreve a data de encerramento original
      // (fato passado — invariante #4).
      const [row] = await db
        .update(bills)
        .set({ estado: "encerrada", encerradaEm })
        .where(
          and(eq(bills.householdId, householdId), eq(bills.id, billId), eq(bills.estado, "ativa")),
        )
        .returning()
      return row ? paraDominio(row) : null
    },

    async reativarBill(householdId: string, billId: string): Promise<Bill | null> {
      // `estado = 'encerrada'` no WHERE torna o Desfazer atômico: só reativa quem
      // está encerrada e, no mesmo UPDATE, limpa `encerradaEm` (o check
      // `bills_encerramento_check` exige encerrada ⇔ data preenchida). Um Desfazer
      // repetido não acha linha encerrada e devolve null — falha seguro (#99, #1).
      const [row] = await db
        .update(bills)
        .set({ estado: "ativa", encerradaEm: null })
        .where(
          and(
            eq(bills.householdId, householdId),
            eq(bills.id, billId),
            eq(bills.estado, "encerrada"),
          ),
        )
        .returning()
      return row ? paraDominio(row) : null
    },

    async contarDependentes(householdId: string, billId: string): Promise<DependentesBill> {
      return contarDependentesDe(db, householdId, billId)
    },

    async deletarBill(householdId: string, billId: string): Promise<DependentesBill | null> {
      // Conta os dependentes antes — apagar a Conta cascateia `payments` e, por
      // eles, os `attachments` (`on delete cascade`); a contagem vem primeiro.
      const dependentes = await contarDependentesDe(db, householdId, billId)
      const removidas = await db
        .delete(bills)
        .where(and(eq(bills.householdId, householdId), eq(bills.id, billId)))
        .returning({ id: bills.id })
      if (removidas.length === 0) return null
      return dependentes
    },

    async definirLogo(
      householdId: string,
      billId: string,
      logoKey: string | null,
    ): Promise<Bill | null> {
      const [row] = await db
        .update(bills)
        .set({ logoKey })
        .where(and(eq(bills.householdId, householdId), eq(bills.id, billId)))
        .returning()
      return row ? paraDominio(row) : null
    },
  }
}
