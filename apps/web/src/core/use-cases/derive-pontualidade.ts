import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import { gridOcorrencias } from "./derive-bill-card"

/**
 * **Pontualidade 12m** (issue #58): compõe sobre o grid de ocorrências do card
 * (#21) — não reimplementa farol nem estado. Conta só ocorrências já vencidas
 * (nunca "aguardando", que ainda não teve chance de atrasar) e com data de
 * pagamento conhecida (nunca "pago-sem-data" — backfill sem recibo não permite
 * julgar pontualidade). `sem-historico` quando nenhuma ocorrência qualifica.
 */
export type Pontualidade12m =
  | { estado: "sem-historico" }
  | { estado: "calculada"; percentual: number }

function contasAtivas(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.estado === "ativa")
}

export function calcularPontualidade12m(
  bills: Bill[],
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
): Pontualidade12m {
  let noPrazo = 0
  let total = 0
  for (const bill of contasAtivas(bills)) {
    const seus = payments.filter((p) => p.billId === bill.id)
    for (const celula of gridOcorrencias(bill, seus, hoje, calendar)) {
      if (celula.estado === "aguardando" || celula.estado === "pago-sem-data") continue
      total += 1
      if (celula.estado === "em-dia") noPrazo += 1
    }
  }
  if (total === 0) return { estado: "sem-historico" }
  return { estado: "calculada", percentual: Math.round((noPrazo / total) * 100) }
}
