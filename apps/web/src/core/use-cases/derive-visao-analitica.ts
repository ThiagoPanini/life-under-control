import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import {
  type GridCelula,
  gridOcorrencias,
  mesDe,
  ocorrenciasRecentes,
  resolverVencimento,
  resumoPagamentos,
} from "./derive-bill-card"
import {
  diasAte,
  type EstadoMes,
  estadoDaOcorrencia,
  fraseDaOcorrencia,
  RANK,
  type ValorCard,
} from "./derive-panorama-mensal"
import { detalharPontualidadeDaConta, type PontualidadeDetalhada } from "./derive-pontualidade"

/**
 * **Visão Analítica por Conta** (issue #127): a última seção do cockpit de
 * Pagamentos Recorrentes — uma linha por Conta com o sinaleiro histórico (grid
 * #21), Pontualidade 12 (#58/#59), sparkline + Média 12 da janela e o valor/
 * estado da ocorrência vigente. Reaproveita o estado e o rank do Panorama (#93)
 * — a pill de estado é fonte única — e as derivações do card (#21); a borda só
 * apresenta (invariante #3; ADR-0003).
 */
export type LinhaAnalitica = {
  billId: string
  /** Conta encerrada: aparece ao fim, atenuada, sem valor/registro (só com o switch ligado). */
  encerrada: boolean
  /** Estado do mês da ocorrência vigente — mesma fonte do card do Panorama. */
  estado: EstadoMes
  /** A Competência da ocorrência vigente (`YYYY-MM`) — a baixa nasce nela. */
  competenciaVigente: string
  /** Vencimento esperado da ocorrência vigente (`YYYY-MM-DD`) — derivado, nunca coluna. */
  vencimento: string
  valor: ValorCard
  /** Leitura de urgência da ocorrência vigente ("vence em 3 dias", "pago em 08/07") — fonte única do Panorama. */
  frase: string
  /** Quem registrou a última baixa da ocorrência vigente; `null` enquanto em aberto. */
  autoria: string | null
  /** As últimas 12 ocorrências (janela por ocorrência, não mês civil) — o sinaleiro. */
  grid: GridCelula[]
  /** Valores pagos da mesma janela do sinaleiro; lacuna (`null`) onde não pagou, nunca zero. */
  sparkline: (number | null)[]
  /** Média (centavos) dos valores pagos da janela; `null` sem histórico. */
  media: number | null
  pontualidade: PontualidadeDetalhada
}

/** A última baixa da Competência (por data de pagamento) — carrega a autoria. */
function ultimaBaixa(baixas: Payment[]): Payment | null {
  if (baixas.length === 0) return null
  return [...baixas].sort((a, b) => (a.dataPagamento ?? "").localeCompare(b.dataPagamento ?? ""))[
    baixas.length - 1
  ]
}

/**
 * Monta a linha de uma Conta sobre sua **ocorrência vigente** (a mais recente
 * até hoje — recorrência-ciente, não o mês civil), reaproveitando o grid (#21),
 * a Pontualidade (#58) e o estado do mês do Panorama (#93). Ao contrário do
 * Panorama, inclui Conta cuja ocorrência vigente não caiu no mês civil corrente
 * (bimestral/anual fora de fase) — a Visão Analítica lista **toda** Conta.
 */
function montarLinha(
  bill: Bill,
  seus: Payment[],
  hoje: string,
  calendar: Calendar,
): LinhaAnalitica {
  const competenciaVigente = ocorrenciasRecentes(bill.recurrence, mesDe(hoje), 1)[0]
  const vencimento = resolverVencimento(
    bill.dueRule,
    bill.dueMonthOffset,
    competenciaVigente,
    calendar,
  )
  // Valor pago = soma **exata** de todas as baixas da Competência vigente, inclusive
  // partidas (CONTEXT.md #6). A célula do sinaleiro/sparkline vem de `gridOcorrencias`,
  // que também soma as baixas do mês (#131) — coluna Valor e ponto do sparkline batem.
  const baixas = seus.filter((p) => p.competencia === competenciaVigente)
  const total = baixas.length > 0 ? baixas.reduce((soma, p) => soma + p.valor, 0) : null
  const quitada = total != null
  const dias = diasAte(hoje, vencimento)
  const estado = estadoDaOcorrencia(quitada, dias)
  const ultima = ultimaBaixa(baixas)

  const grid = gridOcorrencias(bill, seus, hoje, calendar)
  const { media, sparkline } = resumoPagamentos(grid)

  // Em aberto: estimativa pela média da janela do sinaleiro (mesma da coluna
  // Média 12 — colunas adjacentes concordam), nunca R$ 0,00 (CONTEXT.md #4/#5).
  const valor: ValorCard =
    total != null
      ? { estado: "pago", total }
      : media != null
        ? { estado: "estimativa", media }
        : { estado: "ausente" }

  return {
    billId: bill.id,
    encerrada: bill.estado === "encerrada",
    estado,
    competenciaVigente,
    vencimento,
    valor,
    frase: fraseDaOcorrencia(estado, dias, ultima?.dataPagamento ?? null),
    autoria: ultima?.paidBy ?? null,
    grid,
    sparkline,
    media,
    pontualidade: detalharPontualidadeDaConta(grid),
  }
}

/**
 * As linhas da Visão Analítica: uma por Conta ativa, ordenadas pela **mesma**
 * urgência do Panorama (RANK do estado do mês, empate pela proximidade do
 * vencimento). Com `incluirEncerradas`, as encerradas vão ao fim (mais recente
 * encerramento na frente), atenuadas — a borda as rende sem valor nem registro.
 * Sem Conta, devolve vazio (a seção some).
 */
export function derivarVisaoAnaliticaContas(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
  opts: { incluirEncerradas?: boolean } = {},
): LinhaAnalitica[] {
  const hoje = clock.hoje()

  // Índice Conta → seus Lançamentos: uma passagem, sem varredura quadrática.
  const porBill = new Map<string, Payment[]>()
  for (const p of payments) {
    const lista = porBill.get(p.billId)
    if (lista) lista.push(p)
    else porBill.set(p.billId, [p])
  }

  const montar = (bill: Bill) => montarLinha(bill, porBill.get(bill.id) ?? [], hoje, calendar)

  const ativas = bills
    .filter((b) => b.estado === "ativa")
    .map(montar)
    .sort((a, b) => {
      const rank = RANK[a.estado] - RANK[b.estado]
      if (rank !== 0) return rank
      return diasAte(hoje, a.vencimento) - diasAte(hoje, b.vencimento)
    })

  if (!opts.incluirEncerradas) return ativas

  const encerradas = bills
    .filter((b) => b.estado === "encerrada")
    // Mais recente encerramento na frente; `encerradaEm` sempre presente quando encerrada.
    .sort((a, b) => (b.encerradaEm ?? "").localeCompare(a.encerradaEm ?? ""))
    .map(montar)

  return [...ativas, ...encerradas]
}
