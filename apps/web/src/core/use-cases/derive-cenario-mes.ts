import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { addMeses, mesDe } from "./derive-bill-card"
import {
  contarQuitadas,
  contasDoMes,
  type EstimativaMes,
  mediaHistoricaAte,
  type QuitadasMes,
  somarPagoDaCompetencia,
} from "./derive-forma-competencia"

/**
 * **Cenário de Pagamentos do mês vigente** (redesign Final da Análise): o que
 * já foi pago (exato), o que ainda está comprometido (estimativa das Contas em
 * aberto) e a projeção de fechamento comparada ao mês anterior. Tudo derivado
 * de Contas + Lançamentos + `Clock` (invariante #3) — nada disso vira coluna.
 *
 * O comparativo aqui não fere o "mês parcial nunca entra num delta" (#48): o
 * que se compara é a **projeção de fechamento** (mês cheio, ainda que
 * estimada) contra o total pago do mês anterior — nunca o acumulado parcial.
 */

/** Projeção de fechamento: exata quando nada pende; estimada quando pende com histórico. */
export type ProjecaoFechamento =
  | { estado: "exata"; valor: number }
  | { estado: "estimada"; valor: number }
  | { estado: "sem-estimativa" }

/** Delta da projeção vs o total pago do mês anterior; sem-base quando não há projeção ou mês anterior vazio. */
export type ComparativoProjecao =
  | { estado: "sem-base" }
  | { estado: "comparado"; mesAnterior: string; percentual: number }

export type CenarioMes = {
  /** A competência vigente (`YYYY-MM`) — o Cenário é sempre do mês de hoje. */
  competencia: string
  hoje: string
  /** Último dia da competência (`YYYY-MM-DD`) — o "até dd/mm" da leitura. */
  fimDoMes: string
  /** Total pago na competência (exato — o único número que não é estimativa). */
  pago: number
  quitadas: QuitadasMes
  /** Contas do mês ainda sem Lançamento. */
  pendentes: number
  /** Soma das médias históricas das pendentes; sem-historico quando nenhuma tem base. */
  faltaEstimada: EstimativaMes
  projecao: ProjecaoFechamento
  comparativo: ComparativoProjecao
}

function ultimoDiaDoMes(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number)
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${competencia}-${String(dias).padStart(2, "0")}`
}

/** Estimativa do que ainda falta: soma das médias das Contas do mês em aberto (sem zero disfarçado). */
function estimarPendentes(
  pendentes: Bill[],
  payments: Payment[],
  competencia: string,
): EstimativaMes {
  if (pendentes.length === 0) return { estado: "estimado", valor: 0 }
  let total: number | null = null
  for (const bill of pendentes) {
    const media = mediaHistoricaAte(bill, payments, competencia)
    if (media == null) continue
    total = (total ?? 0) + media
  }
  return total == null ? { estado: "sem-historico" } : { estado: "estimado", valor: total }
}

function projetarFechamento(
  pago: number,
  pendentes: number,
  falta: EstimativaMes,
): ProjecaoFechamento {
  if (pendentes === 0) return { estado: "exata", valor: pago }
  if (falta.estado === "sem-historico") return { estado: "sem-estimativa" }
  return { estado: "estimada", valor: pago + falta.valor }
}

function compararComMesAnterior(
  bills: Bill[],
  payments: Payment[],
  competencia: string,
  projecao: ProjecaoFechamento,
): ComparativoProjecao {
  if (projecao.estado === "sem-estimativa") return { estado: "sem-base" }
  const mesAnterior = addMeses(competencia, -1)
  const base = somarPagoDaCompetencia(bills, payments, mesAnterior)
  if (base <= 0) return { estado: "sem-base" }
  return {
    estado: "comparado",
    mesAnterior,
    percentual: ((projecao.valor - base) / base) * 100,
  }
}

/** Compõe o Cenário do mês vigente a partir do `Clock` e dos fatos (Contas + Lançamentos). */
export function derivarCenarioMes(clock: Clock, bills: Bill[], payments: Payment[]): CenarioMes {
  const hoje = clock.hoje()
  const competencia = mesDe(hoje)
  const doMes = contasDoMes(bills, competencia)
  const emAberto = doMes.filter(
    (bill) => !payments.some((p) => p.billId === bill.id && p.competencia === competencia),
  )
  const pago = somarPagoDaCompetencia(bills, payments, competencia)
  const faltaEstimada = estimarPendentes(emAberto, payments, competencia)
  const projecao = projetarFechamento(pago, emAberto.length, faltaEstimada)

  return {
    competencia,
    hoje,
    fimDoMes: ultimoDiaDoMes(competencia),
    pago,
    quitadas: contarQuitadas(bills, payments, competencia),
    pendentes: emAberto.length,
    faltaEstimada,
    projecao,
    comparativo: compararComMesAnterior(bills, payments, competencia, projecao),
  }
}
