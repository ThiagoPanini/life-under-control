import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import {
  type FarolEstado,
  type GridCelula,
  gridOcorrencias,
  mesDe,
  ocorrenciasRecentes,
  resolverVencimento,
  resumoPagamentos,
} from "./derive-bill-card"
import {
  farolDaOcorrencia,
  fraseDaOcorrencia,
  type Ocorrencia,
  ordenarPorUrgencia,
} from "./derive-estado-ocorrencia"
import { calcularPontualidadeDaConta, type Pontualidade12m } from "./derive-pontualidade"

/**
 * **Linha híbrida** da seção "Contas ativas" (issue #56): a extensão do card
 * (#21) que compõe farol/frase de urgência (#62) + grid (#21) + o **valor
 * estado-dependente** — real quando a ocorrência vigente já foi quitada no
 * mês, estimado (média 12) quando ainda está em aberto (CONTEXT.md: o valor
 * exato só nasce no Lançamento). Um único use-case, `Clock` injetado, serve
 * desktop e mobile — só a apresentação empilha.
 */

/** O valor exibido na linha: real (fato) quando quitada, estimado (derivado) quando não. */
export type ValorLinha =
  | { estado: "real"; valor: number }
  | { estado: "estimativa"; media: number | null }

/** A linha de uma Conta ativa: leitura de urgência (#62) + grid (#21) + valor + autoria. */
export type LinhaConta = {
  billId: string
  farol: FarolEstado
  frase: string
  /** A Competência da ocorrência vigente (`YYYY-MM`) — usada pra abrir a baixa já preenchida. */
  competenciaVigente: string
  /** Vencimento esperado da ocorrência vigente (`YYYY-MM-DD`) — derivado, nunca coluna. */
  vencimento: string
  grid: GridCelula[]
  valor: ValorLinha
  /** Quem pagou a ocorrência vigente; `null` enquanto não quitada. */
  autoria: string | null
  media: number | null
  pontualidade: Pontualidade12m
}

type OcorrenciaComBill = Ocorrencia & { billId: string }

function ocorrenciaVigente(
  bill: Bill,
  calendar: Calendar,
  payments: Payment[],
  hoje: string,
): OcorrenciaComBill {
  const competencia = ocorrenciasRecentes(bill.recurrence, mesDe(hoje), 1)[0]
  const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
  const quitada = payments.some((p) => p.competencia === competencia)
  return { billId: bill.id, vencimento, competencia, recurrence: bill.recurrence, quitada }
}

function montarLinha(
  bill: Bill,
  ocorrencia: OcorrenciaComBill,
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
): LinhaConta {
  const pagamentoVigente = payments.find((p) => p.competencia === ocorrencia.competencia)
  const grid = gridOcorrencias(bill, payments, hoje, calendar)
  const { media } = resumoPagamentos(grid)
  const valor: ValorLinha = pagamentoVigente
    ? { estado: "real", valor: pagamentoVigente.valor }
    : { estado: "estimativa", media }

  return {
    billId: bill.id,
    farol: farolDaOcorrencia(ocorrencia, hoje),
    frase: fraseDaOcorrencia(ocorrencia, hoje),
    competenciaVigente: ocorrencia.competencia,
    vencimento: ocorrencia.vencimento,
    grid,
    valor,
    autoria: pagamentoVigente?.paidBy ?? null,
    media,
    pontualidade: calcularPontualidadeDaConta(grid),
  }
}

/** A linha de uma única Conta — usada isoladamente (ex.: revalidar após uma baixa). */
export function derivarLinhaConta(
  clock: Clock,
  calendar: Calendar,
  bill: Bill,
  payments: Payment[],
): LinhaConta {
  const hoje = clock.hoje()
  return montarLinha(
    bill,
    ocorrenciaVigente(bill, calendar, payments, hoje),
    payments,
    hoje,
    calendar,
  )
}

/** As linhas de todas as Contas ativas, já ordenadas por urgência (#62). */
export function derivarLinhasContas(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): LinhaConta[] {
  const hoje = clock.hoje()
  const porBillId = new Map(bills.map((bill) => [bill.id, bill]))
  const ocorrencias = bills.map((bill) =>
    ocorrenciaVigente(
      bill,
      calendar,
      payments.filter((p) => p.billId === bill.id),
      hoje,
    ),
  )
  const ordenadas = ordenarPorUrgencia(ocorrencias, hoje) as OcorrenciaComBill[]

  return ordenadas.map((ocorrencia) => {
    const bill = porBillId.get(ocorrencia.billId)
    if (!bill) throw new Error(`Conta ${ocorrencia.billId} não encontrada`)
    const seus = payments.filter((p) => p.billId === ocorrencia.billId)
    return montarLinha(bill, ocorrencia, seus, hoje, calendar)
  })
}
