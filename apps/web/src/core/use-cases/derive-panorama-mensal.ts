import type { Bill } from "@/core/domain/bill"
import { formatarDataBr } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import { mesDe, resolverVencimento } from "./derive-bill-card"
import { contasDoMes, mediaHistoricaAte } from "./derive-forma-competencia"

/**
 * **Panorama mensal** (issue #93): a derivação única que transforma Contas +
 * Lançamentos + `Clock` + `Calendar` nos modelos prontos dos cards da Análise do
 * mês vigente. Toda a leitura de estado e valor vive aqui — a borda React só
 * junta nome/logo e apresenta, nunca recalcula regra de domínio nem varre
 * Lançamentos por Conta (invariante #3; ADR-0003).
 *
 * O card distingue **fato** (`pago` — soma exata dos Lançamentos da Competência,
 * inclusive baixas fracionadas), **estimativa** (`≈` média histórica, quando em
 * aberto com histórico) e **ausência** (shape explícito, jamais `R$ 0,00`
 * inventado — CONTEXT.md #4/#5: o valor exato só nasce no Lançamento).
 */

/**
 * O estado do card no mês vigente. `pago` prevalece sobre datas; as demais
 * derivam da distância ao vencimento. Só `vencida` (vencimento consumado) veste
 * o semântico `danger`; `vence-em-breve` é atenção (âmbar).
 */
export type EstadoMes = "pago" | "a-vencer" | "vence-em-breve" | "vencida"

/** O valor exibido: fato somado quando pago, estimativa (`≈`) com histórico, ou ausência. */
export type ValorCard =
  | { estado: "pago"; total: number }
  | { estado: "estimativa"; media: number }
  | { estado: "ausente" }

/** O card de uma Conta com ocorrência vigente: estado, valor, autoria e leitura. */
export type CardPanorama = {
  billId: string
  estado: EstadoMes
  /** A Competência da ocorrência vigente (`YYYY-MM`) — a baixa nasce nela. */
  competencia: string
  /** Vencimento esperado da ocorrência vigente (`YYYY-MM-DD`) — derivado, nunca coluna. */
  vencimento: string
  valor: ValorCard
  /** Quem registrou a última baixa da Competência; `null` enquanto em aberto. */
  autoria: string | null
  frase: string
  /** Média histórica (centavos) para pré-preencher a baixa; `null` sem histórico. */
  media: number | null
}

/**
 * Limiar (dias) de **proximidade** do vencimento: faltando de 0 a N dias, o card
 * fica `vence-em-breve`; de N+1 em diante, `a-vencer`. `vence hoje` (0 dias) cai
 * em `vence-em-breve` — não é atraso consumado (issue #93).
 */
export const LIMIAR_VENCE_EM_BREVE_DIAS = 4

const MS_DIA = 86_400_000

/** Dias civis de `hoje` até `alvo` — negativo quando `alvo` já passou. */
function diasAte(hoje: string, alvo: string): number {
  const [a1, m1, d1] = hoje.split("-").map(Number)
  const [a2, m2, d2] = alvo.split("-").map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_DIA)
}

/** Rank de urgência: vencida na frente, pago no fim; empate pela proximidade do vencimento. */
const RANK: Record<EstadoMes, number> = {
  vencida: 0,
  "vence-em-breve": 1,
  "a-vencer": 2,
  pago: 3,
}

function estadoDaOcorrencia(quitada: boolean, dias: number): EstadoMes {
  if (quitada) return "pago"
  if (dias < 0) return "vencida"
  if (dias <= LIMIAR_VENCE_EM_BREVE_DIAS) return "vence-em-breve"
  return "a-vencer"
}

function plural(dias: number): string {
  return dias === 1 ? "dia" : "dias"
}

function fraseDaOcorrencia(estado: EstadoMes, dias: number, dataPagamento: string | null): string {
  if (estado === "pago") {
    return dataPagamento
      ? `pago em ${formatarDataBr(dataPagamento).slice(0, 5)}`
      : "pago · sem data"
  }
  // Frase única para todo estado em aberto, como o protótipo Final: "venceu há",
  // "vence hoje", "vence amanhã", "vence em N dias" — a-vencer não abrevia.
  if (dias < 0) return `venceu há ${-dias} ${plural(-dias)}`
  if (dias === 0) return "vence hoje"
  if (dias === 1) return "vence amanhã"
  return `vence em ${dias} dias`
}

/** A última baixa da Competência (por data de pagamento) — carrega autoria e "pago em". */
function ultimaBaixa(baixas: Payment[]): Payment | null {
  if (baixas.length === 0) return null
  return [...baixas].sort((a, b) => (a.dataPagamento ?? "").localeCompare(b.dataPagamento ?? ""))[
    baixas.length - 1
  ]
}

/**
 * Os cards do panorama do mês vigente — só Contas ativas com ocorrência na
 * Competência (universo M de `contasDoMes`), já ordenados por urgência. Indexa
 * os Lançamentos por Conta uma vez; a borda não faz busca quadrática (issue #93).
 */
export function derivarPanoramaMensal(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): CardPanorama[] {
  const hoje = clock.hoje()
  const competencia = mesDe(hoje)

  // Índice Conta → seus Lançamentos: uma passagem, sem varredura por Conta.
  const porBill = new Map<string, Payment[]>()
  for (const p of payments) {
    const lista = porBill.get(p.billId)
    if (lista) lista.push(p)
    else porBill.set(p.billId, [p])
  }

  const cards = contasDoMes(bills, competencia).map((bill): CardPanorama => {
    const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
    const seus = porBill.get(bill.id) ?? []
    const baixas = seus.filter((p) => p.competencia === competencia)
    const total = baixas.length > 0 ? baixas.reduce((soma, p) => soma + p.valor, 0) : null
    const quitada = total != null
    const dias = diasAte(hoje, vencimento)
    const estado = estadoDaOcorrencia(quitada, dias)

    const media = quitada ? null : mediaHistoricaAte(bill, seus, competencia)
    const valor: ValorCard =
      total != null
        ? { estado: "pago", total }
        : media != null
          ? { estado: "estimativa", media }
          : { estado: "ausente" }

    const ultima = ultimaBaixa(baixas)
    return {
      billId: bill.id,
      estado,
      competencia,
      vencimento,
      valor,
      autoria: ultima?.paidBy ?? null,
      frase: fraseDaOcorrencia(estado, dias, ultima?.dataPagamento ?? null),
      media,
    }
  })

  return cards.sort((a, b) => {
    const rank = RANK[a.estado] - RANK[b.estado]
    if (rank !== 0) return rank
    return diasAte(hoje, a.vencimento) - diasAte(hoje, b.vencimento)
  })
}
