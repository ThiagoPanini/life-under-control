import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import {
  addMeses,
  competenciaDefaultBaixaDoGrid,
  gridOcorrencias,
  mesDe,
  ocorrenciasRecentes,
  resolverVencimento,
} from "./derive-bill-card"

/** Janela de busca (meses) pra achar a Competência cujo vencimento casa com o impresso. */
const JANELA_BUSCA_MESES = 24

/**
 * Infere a Competência de um recibo do WhatsApp para uma Conta já casada —
 * inverso de `resolverVencimento`: do vencimento impresso, acha o mês cuja
 * projeção bate. Vencimento ilegível cai na ocorrência em aberto mais antiga
 * (mesma regra do default da baixa, #63).
 */
export function inferirCompetenciaRecibo(
  bill: Bill,
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
  vencimentoImpresso: string | null,
): string | null {
  if (vencimentoImpresso == null) {
    const grid = gridOcorrencias(bill, payments, hoje, calendar)
    return competenciaDefaultBaixaDoGrid(grid)
  }

  // A competência alvo é exatamente o mês do vencimento impresso menos o
  // offset (`resolverVencimento` desloca a competência por `dueMonthOffset`
  // meses pra chegar no "alvo") — +1 de margem garante que a busca (que anda
  // pra trás a partir da referência) inclua essa competência exata.
  const competenciaExata = addMeses(mesDe(vencimentoImpresso), -bill.dueMonthOffset)
  const refCompetencia = addMeses(competenciaExata, 1)
  const candidatas = ocorrenciasRecentes(
    bill.recurrence,
    refCompetencia,
    JANELA_BUSCA_MESES,
  ).filter((competencia) => competencia >= bill.primeiraCompetencia)
  const casada = candidatas.find(
    (competencia) =>
      resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar) ===
      vencimentoImpresso,
  )
  return casada ?? null
}
