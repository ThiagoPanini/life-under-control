import { type Bill, type BillBruto, type DueRule, validarDadosBill } from "../domain/bill"
import type { BillRepo } from "../ports/bill-repo"
import { BillInvalidaError } from "./create-bill"
import { BillNaoEncontradaError } from "./edit-bill"

/** A regra de vencimento que a edição rápida sabe editar: dia fixo ou último dia útil. */
export type DueRuleSimples = { kind: "dia-fixo"; day: number } | { kind: "ultimo-dia-util" }

/**
 * Allowlist da edição rápida (o lápis do card): os únicos campos que ela toca.
 * `dueRule` ausente **preserva** a regra atual — inclusive uma avançada (n-ésimo
 * dia útil), que o formulário compacto não representa e não pode corromper.
 */
export type CamposEdicaoRapida = {
  nome: string
  icon: string
  dueRule?: DueRuleSimples
}

/**
 * Use-case: edição rápida de uma Conta a partir do card. Relê a Conta e mescla
 * **somente** a allowlist (nome · ícone · vencimento simples) sobre a regra
 * persistida, preservando byte a byte o que o formulário compacto não expõe —
 * descrição, periodicidade, Competência âncora, n-ésimo dia útil e deslocamento
 * (invariante #4: reajustar a regra recalcula o futuro, nunca reescreve fatos).
 * A releitura+merge mora aqui no núcleo porque o port `editarBill` substitui a
 * regra inteira; validamos com a mesma regra do cadastro (`validarDadosBill`).
 * As duas Pessoas editam tudo (acesso simétrico, #1); o escopo é o Lar.
 */
export async function quickEditBill(
  repo: BillRepo,
  householdId: string,
  billId: string,
  campos: CamposEdicaoRapida,
): Promise<Bill> {
  const atual = await repo.obterBill(householdId, billId)
  if (!atual) throw new BillNaoEncontradaError()

  const dueRule: DueRule = campos.dueRule ?? atual.dueRule
  const bruto: BillBruto = {
    nome: campos.nome,
    icon: campos.icon,
    // preservados da Conta relida — nunca coletados do formulário compacto
    descricao: atual.descricao,
    intervalMonths: atual.recurrence.intervalMonths,
    anchorMonth: atual.recurrence.anchorMonth,
    dueMonthOffset: atual.dueMonthOffset,
    // vencimento: a regra simples escolhida, ou a atual preservada
    dueRuleKind: dueRule.kind,
    dueRuleDay: dueRule.kind === "dia-fixo" ? dueRule.day : null,
    dueRuleNth: dueRule.kind === "n-esimo-dia-util" ? dueRule.nth : null,
  }

  const res = validarDadosBill(bruto)
  if (!res.ok) throw new BillInvalidaError(res.erros)

  const atualizada = await repo.editarBill(householdId, billId, res.value)
  if (!atualizada) throw new BillNaoEncontradaError()
  return atualizada
}
