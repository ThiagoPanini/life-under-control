import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import {
  addMeses,
  LIMIAR_PROXIMIDADE_DIAS,
  OCORRENCIAS_NA_JANELA,
  ocorrenciasRecentes,
  resolverVencimento,
} from "./derive-bill-card"

/**
 * **Forma da Competência** (issue #61): a derivação que alimenta a lente de
 * competência (#58), o Painel (#47) e a Pista do mês. Tudo deriva de Contas +
 * Lançamentos + `Clock` + `Calendar` (invariante #3) para uma Competência
 * arbitrária — não necessariamente a de `hoje`.
 *
 * Consequência honesta do "zero valor na Conta" (CONTEXT.md), a mesma do
 * cockpit (#22): **projetado** é sempre estimativa (`~`) derivada do histórico;
 * **pago** é o único número exato. Contas sem histórico não entram na conta —
 * nunca viram `R$ 0,00` disfarçado.
 */

/** Estimativa de valor (centavos) com shape explícito quando não há histórico. */
export type EstimativaMes = { estado: "sem-historico" } | { estado: "estimado"; valor: number }

/** N/M quitadas: `total` conta só Contas ativas com ocorrência na Competência. */
export type QuitadasMes = { quitadas: number; total: number }

/** Estado do marcador na Pista: quitada (paga), a-vencer (perto/vencida) ou aguardando (longe). */
export type EstadoMarcador = "quitada" | "a-vencer" | "aguardando"

/** Um marcador da Pista do mês: uma Conta com ocorrência na Competência. */
export type MarcadorPista = {
  /** Vencimento esperado da ocorrência (`YYYY-MM-DD`) — a posição na Pista. */
  dia: string
  /** A Competência do marcador — pode cair em mês civil diferente de `dia` quando há `dueMonthOffset`. */
  competencia: string
  contaId: string
  titulo: string
  estado: EstadoMarcador
  /** Valor real quando quitada; média do histórico quando em aberto; `null` sem histórico. */
  valorEsperado: number | null
}

/** Uma pendência de competência anterior: ocorrência em aberto que não foi absorvida silenciosamente. */
export type PendenciaAnterior = {
  contaId: string
  titulo: string
  competencia: string
  vencimento: string
}

/** A forma inteira da Competência: os agregados + a coleção de pendências anteriores. */
export type FormaCompetencia = {
  projetado: EstimativaMes
  /** Total **pago** na Competência (exato): soma dos Lançamentos das Contas com ocorrência nela. */
  pago: number
  faltaPagar: EstimativaMes
  quitadas: QuitadasMes
  marcadores: MarcadorPista[]
  /** Nunca campo singular — a UI pode resumir, mas nenhuma pendência se perde aqui. */
  pendenciasAnteriores: PendenciaAnterior[]
}

function contasAtivas(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.estado === "ativa")
}

/** A Competência é mês de ocorrência da Recorrência da Conta? (recua até a fase da âncora e compara). */
function temOcorrenciaNoMes(bill: Bill, competencia: string): boolean {
  return ocorrenciasRecentes(bill.recurrence, competencia, 1)[0] === competencia
}

/** Contas ativas com ocorrência na Competência — o denominador M de quitadas e o universo do projetado/marcadores. */
function contasDoMes(bills: Bill[], competencia: string): Bill[] {
  return contasAtivas(bills).filter((bill) => temOcorrenciaNoMes(bill, competencia))
}

/**
 * Soma os Lançamentos de uma competência — o schema permite **mais de um** por
 * Conta+Competência (baixa partida); `null` quando não há nenhum (ausência,
 * nunca zero).
 */
function somaNaCompetencia(payments: Payment[], competencia: string): number | null {
  const relevantes = payments.filter((p) => p.competencia === competencia)
  if (relevantes.length === 0) return null
  return relevantes.reduce((soma, p) => soma + p.valor, 0)
}

/**
 * Média (centavos) do histórico da Conta nas 12 ocorrências **anteriores** à
 * Competência (a própria Competência fica de fora — é o que se está
 * projetando, não o que já aconteceu). Ignora lacunas (mês sem Lançamento não
 * entra como zero) e soma baixas partidas da mesma competência; `null` sem
 * nenhum Lançamento na janela.
 */
export function mediaHistoricaAte(
  bill: Bill,
  payments: Payment[],
  competencia: string,
): number | null {
  const mesAnterior = addMeses(competencia, -1)
  const janela = ocorrenciasRecentes(bill.recurrence, mesAnterior, OCORRENCIAS_NA_JANELA)
  const seus = payments.filter((p) => p.billId === bill.id)
  const valores = janela
    .map((c) => somaNaCompetencia(seus, c))
    .filter((v): v is number => v != null)
  if (valores.length === 0) return null
  return Math.round(valores.reduce((soma, v) => soma + v, 0) / valores.length)
}

/**
 * Projetado do mês: soma das médias históricas de cada Conta com ocorrência na
 * Competência. Conta sem histórico não contribui (não é zero); se nenhuma
 * contribuir, o shape explícito é "sem-historico" — nunca `R$ 0,00` nem
 * estimativa inventada.
 */
export function projetarGastoDaCompetencia(
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): EstimativaMes {
  let total: number | null = null
  for (const bill of contasDoMes(bills, competencia)) {
    const media = mediaHistoricaAte(bill, payments, competencia)
    if (media == null) continue
    total = (total ?? 0) + media
  }
  return total == null ? { estado: "sem-historico" } : { estado: "estimado", valor: total }
}

/**
 * Total pago na Competência: soma exata dos Lançamentos das Contas com
 * ocorrência nela — o mesmo universo M de `contarQuitadas`, para que `pago`
 * nunca conte dinheiro de uma Conta que `quitadas`/`projetado` já excluíram
 * (ex.: Lançamento fora de fase numa Conta bimestral).
 */
export function somarPagoDaCompetencia(
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): number {
  const doMes = new Set(contasDoMes(bills, competencia).map((b) => b.id))
  return payments
    .filter((p) => doMes.has(p.billId) && p.competencia === competencia)
    .reduce((soma, p) => soma + p.valor, 0)
}

/**
 * Falta pagar: projetado − pago, nunca negativo, sempre estimativa (`~`). Sem
 * projetado (sem histórico) não há base para estimar a diferença.
 */
export function estimarFaltaPagarDoMes(projetado: EstimativaMes, pago: number): EstimativaMes {
  if (projetado.estado === "sem-historico") return { estado: "sem-historico" }
  return { estado: "estimado", valor: Math.max(0, projetado.valor - pago) }
}

/** N/M quitadas: M = só Contas ativas com ocorrência na Competência; N = as que já têm Lançamento nela. */
export function contarQuitadas(
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): QuitadasMes {
  const doMes = contasDoMes(bills, competencia)
  const quitadas = doMes.filter((bill) =>
    payments.some((p) => p.billId === bill.id && p.competencia === competencia),
  ).length
  return { quitadas, total: doMes.length }
}

const MS_DIA = 86_400_000

function diasAte(hoje: string, alvo: string): number {
  const [a1, m1, d1] = hoje.split("-").map(Number)
  const [a2, m2, d2] = alvo.split("-").map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_DIA)
}

/**
 * Os marcadores da Pista do mês: uma Conta com ocorrência na Competência vira
 * um marcador no dia do vencimento esperado. Quitada mostra o valor real da
 * quitação; em aberto mostra a média do histórico (`null` sem histórico —
 * nunca inventa). Perto/vencida (mesmo limiar do farol do card) vira
 * "a-vencer"; longe fica "aguardando".
 */
export function derivarMarcadoresDaPista(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): MarcadorPista[] {
  const hoje = clock.hoje()
  return contasDoMes(bills, competencia).map((bill) => {
    const dia = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
    const seus = payments.filter((p) => p.billId === bill.id)
    const pago = somaNaCompetencia(seus, competencia)

    if (pago != null) {
      return {
        dia,
        competencia,
        contaId: bill.id,
        titulo: bill.nome,
        estado: "quitada",
        valorEsperado: pago,
      }
    }

    const dias = diasAte(hoje, dia)
    const estado: EstadoMarcador = dias > LIMIAR_PROXIMIDADE_DIAS ? "aguardando" : "a-vencer"
    return {
      dia,
      competencia,
      contaId: bill.id,
      titulo: bill.nome,
      estado,
      valorEsperado: mediaHistoricaAte(bill, payments, competencia),
    }
  })
}

/**
 * Pendências de competências anteriores: ocorrências em aberto (sem
 * Lançamento) nas 12 competências que antecedem a Competência alvo, por Conta
 * ativa. Sempre coleção — nunca absorvida no total da Competência atual.
 */
export function listarPendenciasAnteriores(
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): PendenciaAnterior[] {
  const mesAnterior = addMeses(competencia, -1)
  const pendencias: PendenciaAnterior[] = []
  for (const bill of contasAtivas(bills)) {
    const janela = ocorrenciasRecentes(bill.recurrence, mesAnterior, OCORRENCIAS_NA_JANELA)
    const seus = payments.filter((p) => p.billId === bill.id)
    for (const comp of janela) {
      if (seus.some((p) => p.competencia === comp)) continue
      const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, comp, calendar)
      pendencias.push({ contaId: bill.id, titulo: bill.nome, competencia: comp, vencimento })
    }
  }
  return pendencias
}

/**
 * Compõe a forma inteira da Competência a partir do `Clock` e do `Calendar`
 * (os ports) e dos fatos (Contas + Lançamentos). A borda injeta os adapters
 * reais; o Seam 1 injeta os fakes.
 */
export function derivarFormaCompetencia(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
  competencia: string,
): FormaCompetencia {
  const projetado = projetarGastoDaCompetencia(bills, payments, competencia)
  const pago = somarPagoDaCompetencia(bills, payments, competencia)
  return {
    projetado,
    pago,
    faltaPagar: estimarFaltaPagarDoMes(projetado, pago),
    quitadas: contarQuitadas(bills, payments, competencia),
    marcadores: derivarMarcadoresDaPista(clock, calendar, bills, payments, competencia),
    pendenciasAnteriores: listarPendenciasAnteriores(calendar, bills, payments, competencia),
  }
}
