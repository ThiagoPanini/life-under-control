import type { Lar } from "../domain/household"
import type { HouseholdRepo } from "../ports/household-repo"

/** Visão que o Painel renderiza: o Lar e suas Pessoas. */
export type PainelView = {
  lar: Lar
}

/** Não há Lar no repositório — estado inválido para o Painel (deveria haver seed). */
export class LarNaoEncontradoError extends Error {
  constructor() {
    super("Nenhum Lar encontrado")
    this.name = "LarNaoEncontradoError"
  }
}

/**
 * Use-case: lê o Lar atravessando o port. Borda (Server Component) chama isto,
 * nunca o store direto.
 */
export async function getPainel(repo: HouseholdRepo): Promise<PainelView> {
  const lar = await repo.carregarLar()
  if (!lar) throw new LarNaoEncontradoError()
  return { lar }
}
