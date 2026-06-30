import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import { farolDoMes, mesDe, OCORRENCIAS_NA_JANELA, ocorrenciasRecentes } from "./derive-bill-card"

/**
 * **Cockpit de Finanças** (issue #22): os agregados do mês no topo de
 * `/areas/financas`, somando todas as Contas **ativas**. Nada aqui é coluna —
 * tudo deriva de Contas + Lançamentos + `Clock` + `Calendar` (invariante #3:
 * persistir fatos, derivar interpretações), reusando as derivações do card da
 * Conta (issue #21): `farolDoMes` e `ocorrenciasRecentes`.
 *
 * Consequência honesta do "zero valor na Conta" (CONTEXT.md): **não existe valor
 * de conta não-paga**, logo não há "total a pagar" exato. O que dá pra dar de
 * exato é o **pago** (soma dos Lançamentos da competência); o resto do mês é
 * **estimativa** rotulada, derivada do histórico de cada Conta — e só pras Contas
 * que têm histórico.
 */

/** Janela do gasto médio: os últimos 12 meses **completos** (exclui o corrente). */
export const JANELA_GASTO_MESES = 12

/** Recorrência mensal pura — usada só para enumerar a janela de meses do gasto médio. */
const MENSAL = { intervalMonths: 1, anchorMonth: null } as const

/** Os quatro agregados do mês exibidos no cockpit. Dinheiro em centavos (invariante #6). */
export type AgregadosMes = {
  /** Total **pago** no mês corrente (exato): soma dos Lançamentos da competência vigente. */
  totalPagoMes: number
  /** Nº de Contas ativas **em aberto** este mês — farol amarelo (perto) ou vermelho (vencido/hoje). */
  contasEmAberto: number
  /** Gasto mensal **médio** (centavos) nos 12 meses completos; `null` sem histórico na janela. */
  gastoMensalMedio: number | null
  /** **Estimativa** do que ainda falta pagar (centavos), só Contas em aberto com histórico; `null` quando nenhuma. */
  estimativaFaltaPagar: number | null
}

function contasAtivas(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.estado === "ativa")
}

/**
 * Total pago no mês corrente: soma exata dos Lançamentos das Contas ativas cuja
 * competência é o mês de `hoje`. Fato puro, sem derivação — é o único número
 * "exato" do cockpit.
 */
export function totalPagoNoMes(bills: Bill[], payments: Payment[], hoje: string): number {
  const ativas = new Set(contasAtivas(bills).map((b) => b.id))
  const mes = mesDe(hoje)
  return payments
    .filter((p) => ativas.has(p.billId) && p.competencia === mes)
    .reduce((soma, p) => soma + p.valor, 0)
}

/**
 * Nº de Contas ativas em aberto este mês: as de farol **amarelo** (vence perto) ou
 * **vermelho** (vence hoje / já venceu) e ainda não pagas. Verde (paga) e cinza
 * (longe) não contam. Reusa `farolDoMes` do card.
 */
export function contarContasEmAberto(
  bills: Bill[],
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
): number {
  return contasAtivas(bills).filter((bill) => {
    const seus = payments.filter((p) => p.billId === bill.id)
    const farol = farolDoMes(bill, seus, hoje, calendar)
    return farol === "amarelo" || farol === "vermelho"
  }).length
}

/**
 * Gasto mensal médio sobre os 12 meses **completos** anteriores ao corrente: soma
 * todos os Lançamentos das Contas ativas na janela e divide pelos **12 meses** —
 * não pelos meses que tiveram gasto. Dividir pela janela inteira **amortiza** as
 * Contas infrequentes (uma anual de R$1.200 entra como ~R$100/mês, não como um
 * mês de R$1.200); dividir só pelos meses com gasto inflaria o headline. O mês
 * corrente fica fora porque ainda está em curso. `null` quando a janela não tem
 * gasto nenhum. Arredonda ao centavo.
 */
export function gastoMensalMedio(bills: Bill[], payments: Payment[], hoje: string): number | null {
  const ativas = new Set(contasAtivas(bills).map((b) => b.id))
  // 13 meses até o corrente, menos o corrente: os 12 meses completos da janela.
  const janela = new Set(
    ocorrenciasRecentes(MENSAL, mesDe(hoje), JANELA_GASTO_MESES + 1).slice(0, JANELA_GASTO_MESES),
  )

  let total = 0
  let houveGasto = false
  for (const p of payments) {
    if (ativas.has(p.billId) && janela.has(p.competencia)) {
      total += p.valor
      houveGasto = true
    }
  }

  if (!houveGasto) return null
  return Math.round(total / JANELA_GASTO_MESES)
}

/**
 * Média (centavos) dos valores pagos na janela de 12 ocorrências da Conta — a
 * mesma média do card (#21), mas sem montar o grid: só os valores casados por
 * competência, ignorando as lacunas. `null` sem nenhum pagamento na janela.
 */
function mediaPaga(bill: Bill, seus: Payment[], hoje: string): number | null {
  const comps = ocorrenciasRecentes(bill.recurrence, mesDe(hoje), OCORRENCIAS_NA_JANELA)
  const valores = comps
    .map((c) => seus.find((p) => p.competencia === c)?.valor)
    .filter((v): v is number => v != null)
  if (valores.length === 0) return null
  return Math.round(valores.reduce((soma, v) => soma + v, 0) / valores.length)
}

/**
 * Estimativa do que ainda falta pagar este mês: para cada Conta ativa **em aberto**
 * (farol amarelo ou vermelho — o mesmo conjunto de `contarContasEmAberto`) **e com
 * histórico**, soma a média dos seus Lançamentos. Conta sem histórico não estima
 * (não dá pra inventar valor); Conta cinza (longe do vencimento) ou verde (paga)
 * não entra. Se nenhuma Conta qualifica, a estimativa é `null` — não há o que
 * estimar.
 */
export function estimarFaltaPagar(
  bills: Bill[],
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
): number | null {
  let total: number | null = null
  for (const bill of contasAtivas(bills)) {
    const seus = payments.filter((p) => p.billId === bill.id)
    const farol = farolDoMes(bill, seus, hoje, calendar)
    if (farol !== "amarelo" && farol !== "vermelho") continue // só Contas em aberto
    const media = mediaPaga(bill, seus, hoje)
    if (media == null) continue // sem histórico: não estima
    total = (total ?? 0) + media
  }
  return total
}

/**
 * Compõe os quatro agregados do mês a partir do `Clock` e do `Calendar` (os ports)
 * e dos fatos (Contas + Lançamentos). A borda injeta os adapters reais; o Seam 1
 * injeta os fakes.
 */
export function derivarAgregadosFinancas(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): AgregadosMes {
  const hoje = clock.hoje()
  return {
    totalPagoMes: totalPagoNoMes(bills, payments, hoje),
    contasEmAberto: contarContasEmAberto(bills, payments, hoje, calendar),
    gastoMensalMedio: gastoMensalMedio(bills, payments, hoje),
    estimativaFaltaPagar: estimarFaltaPagar(bills, payments, hoje, calendar),
  }
}
