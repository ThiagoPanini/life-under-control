import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { ReciboWhatsapp } from "@/core/domain/recibo-whatsapp"
import type { Calendar } from "@/core/ports/calendar"
import {
  addMeses,
  diffEmDias,
  mesDe,
  ocorrenciasRecentes,
  resolverVencimento,
} from "./derive-bill-card"

/** Uma Conta candidata ao casamento, com seus Lançamentos já lançados. */
export type CandidatoConta = {
  bill: Bill
  payments: Payment[]
}

/**
 * Um candidato ranqueado: a Conta, a Competência mais próxima do recibo (só a
 * estimativa usada no ranking, não a Competência definitiva — para a Conta já
 * casada, use `inferirCompetenciaRecibo`) e o score do casamento.
 */
export type CandidatoRanqueado = {
  bill: Bill
  competencia: string
  score: number
}

/** Sinal suave (nunca eliminatório) — baixa fracionada é legítima. */
const FATOR_COMPETENCIA_COM_LANCAMENTO = 0.9

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Similaridade determinística [0,1]: igualdade exata > um nome inteiramente
 * contido no outro (por token, nunca por substring solta — "Ana" não pode
 * casar dentro de "Mariana Andrade") > sobreposição de tokens.
 */
function similaridadeFavorecido(favorecido: string | null, nomeConta: string): number {
  if (favorecido == null) return 0
  const a = normalizar(favorecido)
  const b = normalizar(nomeConta)
  if (a === "" || b === "") return 0
  if (a === b) return 1
  const tokensA = new Set(a.split(" "))
  const tokensB = new Set(b.split(" "))
  const [menor, maior] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA]
  if ([...menor].every((token) => maior.has(token))) return 0.7
  const intersecao = [...tokensA].filter((t) => tokensB.has(t)).length
  const uniao = new Set([...tokensA, ...tokensB]).size
  return uniao === 0 ? 0 : intersecao / uniao
}

/**
 * A ocorrência da Conta (competência + vencimento) mais próxima de uma
 * data-alvo. A janela busca em torno de um período de recorrência inteiro pra
 * frente e pra trás da estimativa — necessário pra Contas não-mensais
 * (recorrência anual, bienal…), onde uma janela fixa de meses corridos
 * deixaria de encontrar qualquer ocorrência.
 */
function competenciaMaisProxima(
  bill: Bill,
  calendar: Calendar,
  dataAlvo: string,
): { competencia: string; diasDiferenca: number } | null {
  const baseMes = addMeses(mesDe(dataAlvo), -bill.dueMonthOffset)
  const refCompetencia = addMeses(baseMes, bill.recurrence.intervalMonths + 1)
  const candidatas = ocorrenciasRecentes(bill.recurrence, refCompetencia, 5).filter(
    (competencia) => competencia >= bill.primeiraCompetencia,
  )

  let melhor: { competencia: string; diasDiferenca: number } | null = null
  for (const competencia of candidatas) {
    const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
    const diasDiferenca = Math.abs(diffEmDias(vencimento, dataAlvo))
    if (melhor == null || diasDiferenca < melhor.diasDiferenca) {
      melhor = { competencia, diasDiferenca }
    }
  }
  return melhor
}

/**
 * Ranking determinístico de Contas candidatas a um recibo do WhatsApp:
 * similaridade de favorecido × proximidade do vencimento projetado × sinal
 * suave de Competência ainda sem Lançamento (nunca eliminatório — baixa
 * fracionada é legítima). Sem nenhuma data legível no recibo, rankeia só pelo
 * favorecido (o sinal de proximidade fica neutro, nunca zera o de favorecido).
 * Devolve os candidatos ordenados do maior score ao menor; empate preserva a
 * ordem de entrada (ambiguidade explícita, não escolha silenciosa).
 */
export function casarReciboConta(
  recibo: ReciboWhatsapp,
  candidatos: CandidatoConta[],
  calendar: Calendar,
): CandidatoRanqueado[] {
  const dataAlvo = recibo.dataPagamento ?? recibo.vencimentoImpresso

  return candidatos
    .map(({ bill, payments }) => {
      const favorecidoScore = similaridadeFavorecido(recibo.favorecido, bill.nome)
      if (dataAlvo == null) {
        return { bill, competencia: bill.primeiraCompetencia, score: favorecidoScore }
      }

      const proxima = competenciaMaisProxima(bill, calendar, dataAlvo)
      if (proxima == null) return { bill, competencia: bill.primeiraCompetencia, score: 0 }

      const proximidadeScore = 1 / (1 + proxima.diasDiferenca)
      const temLancamento = payments.some((p) => p.competencia === proxima.competencia)
      const fatorCompetencia = temLancamento ? FATOR_COMPETENCIA_COM_LANCAMENTO : 1

      return {
        bill,
        competencia: proxima.competencia,
        score: favorecidoScore * proximidadeScore * fatorCompetencia,
      }
    })
    .sort((a, b) => b.score - a.score)
}
