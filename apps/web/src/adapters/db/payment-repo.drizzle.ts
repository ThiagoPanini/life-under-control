import { and, desc, eq, sql } from "drizzle-orm"
import type { DadosPayment, Payment } from "@/core/domain/payment"
import type { NovoPayment, PaymentRepo } from "@/core/ports/payment-repo"
import { type Db, getDb } from "./client"
import { payments } from "./schema"

/** Linha bruta da tabela `payments` (a forma do Drizzle, não a de domínio). */
type PaymentRow = typeof payments.$inferSelect

/** Traduz uma linha do Postgres na forma de domínio `Payment`. */
function paraDominio(row: PaymentRow): Payment {
  return {
    id: row.id,
    householdId: row.householdId,
    billId: row.billId,
    valor: row.valor,
    dataPagamento: row.dataPagamento,
    competencia: row.competencia,
    paidBy: row.paidBy,
  }
}

/** Desmembra os `DadosPayment` validados nas colunas de `payments` (sem identidade). */
function colunasDosDados(dados: DadosPayment) {
  return {
    valor: dados.valor,
    dataPagamento: dados.dataPagamento,
    competencia: dados.competencia,
    paidBy: dados.paidBy,
  }
}

/**
 * Adapter Drizzle do `PaymentRepo` (ADR-0003). Traduz entre a forma de domínio e
 * as colunas de `payments`, escopando tudo pelo Lar. O `db` é injetável para o
 * teste de Seam 2.
 */
export function drizzlePaymentRepo(db: Db = getDb()): PaymentRepo {
  return {
    async criarPayment(novo: NovoPayment): Promise<Payment> {
      const [row] = await db
        .insert(payments)
        .values({ householdId: novo.householdId, billId: novo.billId, ...colunasDosDados(novo) })
        .returning()
      return paraDominio(row)
    },

    async listarPayments(householdId: string, billId: string): Promise<Payment[]> {
      const linhas = await db
        .select()
        .from(payments)
        .where(and(eq(payments.householdId, householdId), eq(payments.billId, billId)))
        // Mais recentes primeiro; "pago sem data" (backfill) vai pro fim.
        .orderBy(
          sql`${payments.dataPagamento} desc nulls last`,
          desc(payments.competencia),
          desc(payments.id),
        )
      return linhas.map(paraDominio)
    },

    async listarTodosPayments(householdId: string): Promise<Payment[]> {
      const linhas = await db
        .select()
        .from(payments)
        .where(eq(payments.householdId, householdId))
        // Mesma ordem do listar por Conta: mais recentes primeiro.
        .orderBy(
          sql`${payments.dataPagamento} desc nulls last`,
          desc(payments.competencia),
          desc(payments.id),
        )
      return linhas.map(paraDominio)
    },

    async editarPayment(
      householdId: string,
      paymentId: string,
      dados: DadosPayment,
    ): Promise<Payment | null> {
      const [row] = await db
        .update(payments)
        .set(colunasDosDados(dados))
        .where(and(eq(payments.householdId, householdId), eq(payments.id, paymentId)))
        .returning()
      return row ? paraDominio(row) : null
    },

    async deletarPayment(householdId: string, paymentId: string): Promise<boolean> {
      const removidos = await db
        .delete(payments)
        .where(and(eq(payments.householdId, householdId), eq(payments.id, paymentId)))
        .returning({ id: payments.id })
      return removidos.length > 0
    },
  }
}
