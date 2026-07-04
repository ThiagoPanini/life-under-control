import type { Bill } from "../domain/bill"
import type { BillRepo } from "../ports/bill-repo"
import { BillNaoEncontradaError } from "./edit-bill"

/**
 * Use-case: reativa uma Conta **encerrada** do Lar — o Desfazer do gesto rápido de
 * "Excluir Conta" (#99). Volta a `ativa` e limpa `encerradaEm` de forma atômica,
 * então a Conta reaparece no panorama e volta a projetar dali pra frente. Nada de
 * fato é tocado: Lançamentos, Anexos e logo permanecem (invariante #4) — o Desfazer
 * é não-destrutivo. O port só reativa quem está encerrada (transição atômica): um
 * Desfazer repetido não acha Conta encerrada e lança `BillNaoEncontradaError`, o
 * mesmo caminho do escopo por Lar (#1). As duas Pessoas desfazem (acesso simétrico).
 */
export async function reativarBill(
  repo: BillRepo,
  householdId: string,
  billId: string,
): Promise<Bill> {
  const reativada = await repo.reativarBill(householdId, billId)
  if (!reativada) throw new BillNaoEncontradaError()
  return reativada
}
