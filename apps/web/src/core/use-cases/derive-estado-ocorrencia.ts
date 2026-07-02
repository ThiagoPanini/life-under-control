import { descreverMesPorExtenso, formatarDataBr, type Recurrence } from "@/core/domain/bill"
import { descreverCompetencia } from "@/core/domain/payment"
import { type FarolEstado, LIMIAR_PROXIMIDADE_DIAS } from "./derive-bill-card"

/**
 * Leitura de estado de uma ocorrência (issue #62) — a derivação única de farol,
 * frase e ordenação por urgência para toda vista que lista ocorrências (Painel,
 * linha híbrida, detalhe da Conta, Agenda). Nenhuma borda reinterpreta: a mesma
 * entrada produz a mesma frase em toda vista.
 *
 * A entrada já traz o vencimento resolvido (a Conta projeta o "quando" —
 * invariante #5) e se a ocorrência foi quitada (tem Lançamento na Competência);
 * este use-case não conhece Conta nem Lançamento, só a leitura já feita deles.
 */

const MS_DIA = 86_400_000

function comoTimestamp(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number)
  return Date.UTC(ano, mes - 1, dia)
}

/** Dias civis de `hoje` até `vencimento` — negativo quando já venceu. */
function diasAteVencimento(hoje: string, vencimento: string): number {
  return Math.round((comoTimestamp(vencimento) - comoTimestamp(hoje)) / MS_DIA)
}

const RANK_FAROL: Record<FarolEstado, number> = { vermelho: 0, amarelo: 1, cinza: 2, verde: 3 }

/** Uma ocorrência já lida: vencimento resolvido, Competência e se está quitada. */
export type Ocorrencia = {
  /** Vencimento esperado da ocorrência (`YYYY-MM-DD`), já resolvido pela Conta. */
  vencimento: string
  /** A Competência da ocorrência (`YYYY-MM`). */
  competencia: string
  /** A Recorrência da Conta — define a granularidade de exibição da Competência. */
  recurrence: Recurrence
  /** Tem Lançamento nessa Competência. */
  quitada: boolean
}

/** O farol da ocorrência nos 4 estados. */
export function farolDaOcorrencia(ocorrencia: Ocorrencia, hoje: string): FarolEstado {
  if (ocorrencia.quitada) return "verde"
  const dias = diasAteVencimento(hoje, ocorrencia.vencimento)
  if (dias > LIMIAR_PROXIMIDADE_DIAS) return "cinza"
  if (dias >= 1) return "amarelo"
  return "vermelho"
}

/** A frase de leitura da ocorrência ("venceu há 8 dias", "vence em 2 dias", "em 14 dias", "quitada · Julho/2026"). */
export function fraseDaOcorrencia(ocorrencia: Ocorrencia, hoje: string): string {
  if (ocorrencia.quitada) {
    return `quitada · ${descreverCompetencia(ocorrencia.competencia, ocorrencia.recurrence)}`
  }
  const dias = diasAteVencimento(hoje, ocorrencia.vencimento)
  if (dias < 0) return `venceu há ${-dias} ${-dias === 1 ? "dia" : "dias"}`
  if (dias === 0) return "vence hoje"
  if (dias <= LIMIAR_PROXIMIDADE_DIAS) return `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`
  return `em ${dias} ${dias === 1 ? "dia" : "dias"}`
}

/**
 * Leitura longa da ocorrência, para o header-card do detalhe da Conta (#59):
 * "competência de junho sem Lançamento — venceu 28/06/2026" · "— vence hoje" ·
 * "— vence 20/07/2026" · "competência de junho quitada" (quitada não repete o
 * vencimento — a pílula/frase curta já cobre "quando pagou").
 */
export function leituraLongaDaOcorrencia(ocorrencia: Ocorrencia, hoje: string): string {
  const mes = descreverMesPorExtenso(ocorrencia.competencia).split(" de ")[0]
  if (ocorrencia.quitada) return `competência de ${mes} quitada`

  const dias = diasAteVencimento(hoje, ocorrencia.vencimento)
  if (dias < 0)
    return `competência de ${mes} sem Lançamento — venceu ${formatarDataBr(ocorrencia.vencimento)}`
  if (dias === 0) return `competência de ${mes} sem Lançamento — vence hoje`
  return `competência de ${mes} sem Lançamento — vence ${formatarDataBr(ocorrencia.vencimento)}`
}

/** Ordena ocorrências por urgência: vermelho → amarelo → cinza → verde; empate pela proximidade do vencimento. */
export function ordenarPorUrgencia(ocorrencias: Ocorrencia[], hoje: string): Ocorrencia[] {
  return [...ocorrencias].sort((a, b) => {
    const rank = RANK_FAROL[farolDaOcorrencia(a, hoje)] - RANK_FAROL[farolDaOcorrencia(b, hoje)]
    if (rank !== 0) return rank
    return diasAteVencimento(hoje, a.vencimento) - diasAteVencimento(hoje, b.vencimento)
  })
}
