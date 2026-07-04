/**
 * Lançamento (`Payment`) — núcleo puro (ADR-0003). A especialização de Registro
 * em Finanças (ADR-0005): o fato de um pagamento efetuado, ligado a uma Conta.
 * Nasce na quitação com o **valor real** do momento (centavos, invariante #6),
 * a **data de pagamento** (data civil), a **Competência** (`ano-mês`) e **quem
 * pagou** (autoria, nunca permissão — invariante #1). Aqui só há tipos e
 * validação pura; nada de Drizzle, Next ou React, e nenhum relógio real — o
 * "hoje" entra como parâmetro (via `Clock`, injetado no use-case).
 */

import {
  type ErroCampo,
  ehCompetenciaValida,
  ehDataIsoValida,
  MESES,
  type Recurrence,
} from "./bill"

// A Competência (`ano-mês`) é validada no módulo-base do domínio (`bill.ts`);
// reexportada aqui para as bordas que já a importam de `payment`.
export { ehCompetenciaValida }

/** Os dados de um Lançamento já validados e normalizados. */
export type DadosPayment = {
  /** Valor pago, inteiro em centavos, BRL (invariante #6). Sempre positivo. */
  valor: number
  /**
   * Data civil (YYYY-MM-DD) em que se pagou. No fluxo normal de baixa nunca é
   * nula (assume hoje via `Clock`); `null` fica reservado ao backfill sem recibo
   * (estado "pago sem data", fora desta fatia).
   */
  dataPagamento: string | null
  /** A Competência a que o pagamento se refere, armazenada como `ano-mês` (YYYY-MM). */
  competencia: string
  /** A Pessoa que pagou (id) — autoria, não autorização (#1). */
  paidBy: string
}

/** Um Lançamento persistido: os dados + identidade, o Lar dono e a Conta de origem. */
export type Payment = DadosPayment & {
  id: string
  householdId: string
  billId: string
}

/** Entrada crua da baixa/edição (a borda traduz o FormData nisto; valor já em centavos). */
export type PaymentBruto = {
  /** Centavos já parseados pela borda; `NaN` quando o texto não era dinheiro. */
  valor: number
  /** Vazio/ausente assume hoje (via `Clock`); preenchido precisa ser data ISO. */
  dataPagamento?: string | null
  competencia: string
  paidBy: string
}

export type ValidacaoPayment = { ok: true; value: DadosPayment } | { ok: false; erros: ErroCampo[] }

/**
 * Valida e normaliza uma baixa/edição de Lançamento. Fonte única da regra: os
 * use-cases `recordPayment`/`editPayment` consomem isto. Valor deve ser inteiro
 * positivo em centavos (#6); competência `ano-mês`; quem pagou, obrigatório.
 *
 * Data de pagamento vazia vira `null` ("pago sem data") — preserva o que a
 * Pessoa fez: limpar a data na edição **não** a reescreve com hoje. O default
 * "hoje" é da baixa, e mora no `recordPayment` (via `Clock`), não aqui.
 */
export function validarDadosPayment(bruto: PaymentBruto): ValidacaoPayment {
  const erros: ErroCampo[] = []

  const valor = bruto.valor
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor <= 0)
    erros.push({ campo: "valor", mensagem: "Informe um valor maior que zero." })

  // Data de pagamento: vazia/ausente é null; preenchida precisa ser data civil real.
  const dataRaw = bruto.dataPagamento == null ? "" : String(bruto.dataPagamento).trim()
  let dataPagamento: string | null = null
  if (dataRaw === "") dataPagamento = null
  else if (ehDataIsoValida(dataRaw)) dataPagamento = dataRaw
  else erros.push({ campo: "dataPagamento", mensagem: "Data de pagamento inválida." })

  const competencia = (bruto.competencia ?? "").trim()
  if (!ehCompetenciaValida(competencia))
    erros.push({ campo: "competencia", mensagem: "Competência inválida (ano-mês)." })

  const paidBy = (bruto.paidBy ?? "").trim()
  if (!paidBy) erros.push({ campo: "paidBy", mensagem: "Escolha quem pagou." })

  if (erros.length > 0) return { ok: false, erros }
  return { ok: true, value: { valor, dataPagamento, competencia, paidBy } }
}

/**
 * Descreve uma Competência na granularidade da Recorrência (CONTEXT.md): mensal
 * (e demais cadências) mostra "Julho/2026"; anual mostra só o ano ("2026"). A
 * competência é sempre `ano-mês` no banco — aqui só muda a *exibição*.
 */
export function descreverCompetencia(competencia: string, recurrence: Recurrence): string {
  const [ano, mes] = competencia.split("-")
  if (recurrence.intervalMonths === 12) return ano
  return `${MESES[Number(mes) - 1]}/${ano}`
}
