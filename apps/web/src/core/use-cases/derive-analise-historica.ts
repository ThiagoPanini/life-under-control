import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { mesDe, ocorrenciasRecentes } from "./derive-bill-card"

/** A janela da Análise Histórica: as doze Competências consecutivas até a atual (inclusive). */
export const JANELA_HISTORICA_MESES = 12

/**
 * Recorrência mensal pura — enumera a janela de meses consecutivos (sem âncora).
 * Compartilhada com o Mapa do Ano (#102), que usa a mesma janela (ADR-0011).
 */
export const MENSAL = { intervalMonths: 1, anchorMonth: null } as const

/**
 * Estado de um ponto da série. `em-curso` é o mês corrente (parcial); `sem-dado`
 * é o mês fechado sem nenhum Lançamento — ausência honesta, não um gasto zero
 * (CONTEXT.md #3: ausência ≠ zero). O resto é `fechado` (mês fechado com fato).
 */
export type EstadoTotalPagoMes = "fechado" | "em-curso" | "sem-dado"

export type PontoTotalPagoMes = {
  competencia: string
  valor: number
  estado: EstadoTotalPagoMes
}

/**
 * A série do Total Pago por Mês. `sem-fatos` é o estado vazio honesto: nenhum
 * Lançamento na janela — distinto de doze meses de zero, que esconderia a
 * ausência. `com-dados` sempre traz a janela inteira, com `sem-dado` marcando os
 * meses sem fato (histórico curto continua visível, não sumido).
 */
export type SerieHistorica =
  | { estado: "sem-fatos" }
  | { estado: "com-dados"; pontos: PontoTotalPagoMes[] }

/**
 * Total Pago por Mês nas últimas `tamanho` Competências até a atual, derivado só
 * dos fatos (Clock injetado, sem Calendar — a janela é aritmética de mês civil,
 * não de dia útil bancário). Soma **todos** os Lançamentos por Competência, sem
 * filtrar por estado da Conta: splits somam e fatos de Contas hoje encerradas
 * entram. Pré-indexa os Lançamentos por Competência (uma varredura) e só então
 * consulta a janela.
 */
export function derivarAnaliseHistorica(
  clock: Clock,
  payments: Payment[],
  tamanho = JANELA_HISTORICA_MESES,
): SerieHistorica {
  const mesCorrente = mesDe(clock.hoje())
  const janela = ocorrenciasRecentes(MENSAL, mesCorrente, tamanho)
  const porCompetencia = indexarPorCompetencia(payments)

  // Uma varredura da janela: monta os pontos e detecta se há qualquer fato (o
  // que mantém a série viva mesmo sem Conta ativa) — sem um segundo passe.
  const pontos: PontoTotalPagoMes[] = []
  let temFato = false
  for (const competencia of janela) {
    const fatos = porCompetencia.get(competencia) ?? []
    if (fatos.length > 0) temFato = true
    const valor = fatos.reduce((soma, payment) => soma + payment.valor, 0)
    const estado: EstadoTotalPagoMes =
      competencia === mesCorrente ? "em-curso" : fatos.length === 0 ? "sem-dado" : "fechado"
    pontos.push({ competencia, valor, estado })
  }

  return temFato ? { estado: "com-dados", pontos } : { estado: "sem-fatos" }
}

/** Agrupa os Lançamentos por Competência numa varredura — o índice que a janela consulta. */
function indexarPorCompetencia(payments: Payment[]): Map<string, Payment[]> {
  const indice = new Map<string, Payment[]>()
  for (const payment of payments) {
    const grupo = indice.get(payment.competencia)
    if (grupo) grupo.push(payment)
    else indice.set(payment.competencia, [payment])
  }
  return indice
}
