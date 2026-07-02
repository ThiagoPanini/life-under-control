import { AREAS } from "@/core/domain/areas"
import { type Bill, MESES } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import { SUBJECTS } from "@/core/domain/subjects"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import { mesDe, ocorrenciasRecentes, resolverVencimento } from "./derive-bill-card"
import {
  farolDaOcorrencia,
  fraseDaOcorrencia,
  type Ocorrencia,
  ordenarPorUrgencia,
} from "./derive-estado-ocorrencia"
import {
  contarQuitadas,
  derivarMarcadoresDaPista,
  type MarcadorPista,
  mediaHistoricaAte,
  type QuitadasMes,
} from "./derive-forma-competencia"

/**
 * Use-case de **atenção** do Painel (issue #47): compõe #61 (forma da
 * Competência) e #62 (farol/frase/urgência da ocorrência) — nunca recalcula
 * farol, frase ou proximidade. Hoje só Finanças alimenta Contas reais; o
 * catálogo de origem cresce por Área (ADR-0005), não se generaliza daqui.
 */

/** Um item da tira "pede atenção": vencida, vence hoje ou vence em ≤3 dias. */
export type ItemAtencao = {
  contaId: string
  titulo: string
  /** A Competência da ocorrência pendente — a borda usa para linkar a baixa na ocorrência certa (#63). */
  competencia: string
  farol: "amarelo" | "vermelho"
  frase: string
  detalhe: string
  origem: string
  /** Média do histórico (centavos); `null` sem histórico — nunca `R$ 0,00` disfarçado. */
  valorEstimado: number | null
}

/** A tira "pede atenção": nunca lista vazia — "calma" é o estado explícito de nada pendente. */
export type TiraAtencao =
  | { estado: "calma" }
  | { estado: "pendente"; itens: ItemAtencao[]; totalEstimado: number | null }

export type ItemProximo = { titulo: string; frase: string }

/** O hero-card da Área ativa: quitadas do mês, a próxima Conta e a mini-pista só-leitura. */
export type HeroAreaAtiva = {
  competencia: string
  quitadas: QuitadasMes
  proxima: ItemProximo | null
  pista: MarcadorPista[]
}

export type AtencaoDoPainel = { tira: TiraAtencao; hero: HeroAreaAtiva }

const AREA_FINANCAS_NOME = AREAS.find((area) => area.slug === "financas")?.nome ?? "Finanças"
const ASSUNTO_PAGAMENTOS_NOME =
  SUBJECTS.find((assunto) => assunto.slug === "pagamentos-recorrentes")?.nome ??
  "Pagamentos Recorrentes"
const ORIGEM_PAGAMENTOS = `${AREA_FINANCAS_NOME} · ${ASSUNTO_PAGAMENTOS_NOME}`

function ocorrenciaAtual(
  bill: Bill,
  payments: Payment[],
  calendar: Calendar,
  hoje: string,
): Ocorrencia {
  const competencia = ocorrenciasRecentes(bill.recurrence, mesDe(hoje), 1)[0]
  const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
  const quitada = payments.some((p) => p.billId === bill.id && p.competencia === competencia)
  return { vencimento, competencia, recurrence: bill.recurrence, quitada }
}

function detalheSemLancamento(competencia: string): string {
  const mes = Number(competencia.slice(5, 7))
  return `competência de ${MESES[mes - 1].toLowerCase()}, sem Lançamento`
}

/** Tira "pede atenção" (issue #47): Contas ativas vencidas, vencendo hoje ou em ≤3 dias. */
export function derivarTiraAtencao(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): TiraAtencao {
  const hoje = clock.hoje()
  const candidatos = bills
    .filter((bill) => bill.estado === "ativa")
    .map((bill) => ({ bill, ocorrencia: ocorrenciaAtual(bill, payments, calendar, hoje) }))
    .filter((c) => {
      const farol = farolDaOcorrencia(c.ocorrencia, hoje)
      return farol === "amarelo" || farol === "vermelho"
    })

  if (candidatos.length === 0) return { estado: "calma" }

  const ordenadas = ordenarPorUrgencia(
    candidatos.map((c) => c.ocorrencia),
    hoje,
  )
  const itens = ordenadas.map((ocorrencia) => {
    const { bill } = candidatos.find(
      (c) => c.ocorrencia === ocorrencia,
    ) as (typeof candidatos)[number]
    return {
      contaId: bill.id,
      titulo: bill.nome,
      competencia: ocorrencia.competencia,
      farol: farolDaOcorrencia(ocorrencia, hoje) as "amarelo" | "vermelho",
      frase: fraseDaOcorrencia(ocorrencia, hoje),
      detalhe: detalheSemLancamento(ocorrencia.competencia),
      origem: ORIGEM_PAGAMENTOS,
      valorEstimado: mediaHistoricaAte(bill, payments, ocorrencia.competencia),
    }
  })

  const valores = itens.map((item) => item.valorEstimado).filter((v): v is number => v != null)
  const totalEstimado = valores.length === 0 ? null : valores.reduce((soma, v) => soma + v, 0)

  return { estado: "pendente", itens, totalEstimado }
}

function proximaDoMes(
  marcadores: MarcadorPista[],
  bills: Bill[],
  hoje: string,
): ItemProximo | null {
  // Vencida já aparece na tira "pede atenção" (farol vermelho) — "próxima" é só o que ainda vem pela frente.
  const pendentes = [...marcadores.filter((m) => m.estado !== "quitada" && m.dia >= hoje)].sort(
    (a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0),
  )
  const proximo = pendentes[0]
  if (!proximo) return null
  const bill = bills.find((b) => b.id === proximo.contaId)
  if (!bill) return null
  const ocorrencia: Ocorrencia = {
    vencimento: proximo.dia,
    competencia: proximo.competencia,
    recurrence: bill.recurrence,
    quitada: false,
  }
  return { titulo: proximo.titulo, frase: fraseDaOcorrencia(ocorrencia, hoje) }
}

/** Hero-card da Área ativa (issue #47): "N/M quitadas" + próxima Conta + mini-pista só-leitura do mês. */
export function derivarHeroAreaAtiva(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): HeroAreaAtiva {
  const hoje = clock.hoje()
  const competencia = mesDe(hoje)
  const marcadores = derivarMarcadoresDaPista(clock, calendar, bills, payments, competencia)
  return {
    competencia,
    quitadas: contarQuitadas(bills, payments, competencia),
    proxima: proximaDoMes(marcadores, bills, hoje),
    pista: marcadores,
  }
}

/** Compõe a tira e o hero-card do mesmo `Clock` — o Painel consome isto por inteiro. */
export function derivarAtencaoDoPainel(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): AtencaoDoPainel {
  return {
    tira: derivarTiraAtencao(clock, calendar, bills, payments),
    hero: derivarHeroAreaAtiva(clock, calendar, bills, payments),
  }
}
