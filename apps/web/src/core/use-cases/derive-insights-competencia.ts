import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { addMeses, mesDe, ocorrenciasRecentes } from "./derive-bill-card"

export type VariacaoConta = {
  contaId: string
  titulo: string
  valorAnterior: number
  valorAtual: number
  deltaValor: number
  deltaPercentual: number
}

export type ComparacaoContasCompetencia =
  | { estado: "em-curso" }
  | { estado: "sem-base"; competenciaAnterior: string }
  | {
      estado: "calculada"
      competenciaAnterior: string
      maiorAlta: VariacaoConta | null
      maiorQueda: VariacaoConta | null
    }

export type InsightsCompetencia = {
  estadoCompetencia: "em-curso" | "fechada"
  /** Data civil usada pelas leituras móveis da janela de 12 competências. */
  dataReferencia: string
  comparacao: ComparacaoContasCompetencia
  maiorLancamento: {
    paymentId: string
    contaId: string
    titulo: string
    valor: number
  } | null
  semLancamento: {
    quantidade: number
    contas: { contaId: string; titulo: string }[]
  }
  concentracaoTresMaiores: number | null
}

function ultimoDiaDaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number)
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${competencia}-${String(dia).padStart(2, "0")}`
}

function totalDaConta(payments: Payment[], billId: string, competencia: string): number | null {
  const encontrados = payments.filter(
    (payment) => payment.billId === billId && payment.competencia === competencia,
  )
  if (encontrados.length === 0) return null
  return encontrados.reduce((total, payment) => total + payment.valor, 0)
}

function compararContas(
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): Exclude<ComparacaoContasCompetencia, { estado: "em-curso" }> {
  const competenciaAnterior = addMeses(competencia, -1)
  const variacoes = bills.flatMap((bill): VariacaoConta[] => {
    const valorAnterior = totalDaConta(payments, bill.id, competenciaAnterior)
    const valorAtual = totalDaConta(payments, bill.id, competencia)
    // Uma ausência é lacuna, nunca zero. Sem fatos nos dois lados não existe
    // base honesta para atribuir variação à Conta.
    if (valorAnterior == null || valorAtual == null) return []
    const deltaValor = valorAtual - valorAnterior
    return [
      {
        contaId: bill.id,
        titulo: bill.nome,
        valorAnterior,
        valorAtual,
        deltaValor,
        deltaPercentual: Math.round((deltaValor / valorAnterior) * 1_000) / 10,
      },
    ]
  })

  if (variacoes.length === 0) return { estado: "sem-base", competenciaAnterior }

  const altas = variacoes.filter((item) => item.deltaPercentual > 0)
  const quedas = variacoes.filter((item) => item.deltaPercentual < 0)
  return {
    estado: "calculada",
    competenciaAnterior,
    maiorAlta: altas.sort((a, b) => b.deltaPercentual - a.deltaPercentual)[0] ?? null,
    maiorQueda: quedas.sort((a, b) => a.deltaPercentual - b.deltaPercentual)[0] ?? null,
  }
}

function temOcorrencia(bill: Bill, competencia: string): boolean {
  return ocorrenciasRecentes(bill.recurrence, competencia, 1)[0] === competencia
}

function derivarLeiturasDoMes(
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): Pick<InsightsCompetencia, "maiorLancamento" | "semLancamento" | "concentracaoTresMaiores"> {
  const contas = bills.filter((bill) => bill.estado === "ativa" && temOcorrencia(bill, competencia))
  const porId = new Map(contas.map((bill) => [bill.id, bill]))
  const lancamentos = payments.filter(
    (payment) => payment.competencia === competencia && porId.has(payment.billId),
  )
  const maior = [...lancamentos].sort((a, b) => b.valor - a.valor)[0]
  const maiorBill = maior ? porId.get(maior.billId) : undefined

  const semLancamento = contas
    .filter((bill) => !lancamentos.some((payment) => payment.billId === bill.id))
    .map((bill) => ({ contaId: bill.id, titulo: bill.nome }))

  const totais = contas
    .map((bill) => totalDaConta(lancamentos, bill.id, competencia))
    .filter((valor): valor is number => valor != null)
    .sort((a, b) => b - a)
  const total = totais.reduce((soma, valor) => soma + valor, 0)
  const tresMaiores = totais.slice(0, 3).reduce((soma, valor) => soma + valor, 0)

  return {
    maiorLancamento:
      maior && maiorBill
        ? {
            paymentId: maior.id,
            contaId: maior.billId,
            titulo: maiorBill.nome,
            valor: maior.valor,
          }
        : null,
    semLancamento: { quantidade: semLancamento.length, contas: semLancamento },
    concentracaoTresMaiores: total === 0 ? null : Math.round((tresMaiores / total) * 1_000) / 10,
  }
}

/**
 * Leituras por Conta de uma Competência. O relógio entra pelo port para que a
 * Competência corrente seja sempre `em curso` e nunca gere uma falsa variação.
 */
export function derivarInsightsCompetencia(
  clock: Clock,
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): InsightsCompetencia {
  const mesCorrente = mesDe(clock.hoje())
  const leituras = derivarLeiturasDoMes(bills, payments, competencia)
  if (competencia >= mesCorrente) {
    return {
      estadoCompetencia: "em-curso",
      dataReferencia: clock.hoje(),
      comparacao: { estado: "em-curso" },
      ...leituras,
    }
  }
  return {
    estadoCompetencia: "fechada",
    dataReferencia: ultimoDiaDaCompetencia(competencia),
    comparacao: compararContas(bills, payments, competencia),
    ...leituras,
  }
}
