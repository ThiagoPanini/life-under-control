import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import { type GridCelula, gridOcorrencias } from "./derive-bill-card"

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

function pontualidadeDoGrid(grid: GridCelula[]): Pontualidade12m {
  let noPrazo = 0
  let total = 0
  for (const celula of grid) {
    if (celula.estado === "aguardando" || celula.estado === "pago-sem-data") continue
    total += 1
    if (celula.estado === "em-dia") noPrazo += 1
  }
  if (total === 0) return { estado: "sem-historico" }
  return { estado: "calculada", percentual: Math.round((noPrazo / total) * 100) }
}

export function calcularPontualidade12m(
  bills: Bill[],
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
): Pontualidade12m {
  const grid = contasAtivas(bills).flatMap((bill) =>
    gridOcorrencias(
      bill,
      payments.filter((p) => p.billId === bill.id),
      hoje,
      calendar,
    ),
  )
  return pontualidadeDoGrid(grid)
}

/**
 * Pontualidade 12m de **uma** Conta (issue #59), sobre o grid que ela já traz
 * de `derivarCardConta` — nada recalculado. Ao contrário de
 * `calcularPontualidade12m`, não filtra por Conta ativa: o detalhe mostra a
 * pontualidade da própria Conta mesmo encerrada.
 */
export function calcularPontualidadeDaConta(grid: GridCelula[]): Pontualidade12m {
  return pontualidadeDoGrid(grid)
}
