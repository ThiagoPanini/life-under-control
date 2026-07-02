import type { Bill } from "../domain/bill"
import type { AttachmentStore } from "../ports/attachment-store"
import type { BillRepo } from "../ports/bill-repo"
import { BillNaoEncontradaError } from "./edit-bill"

/**
 * Use-case: remove o logo de uma Conta — espelha `removeAttachment`. Apaga
 * primeiro `bills.logoKey` (a fonte de verdade do que existe) e só então o
 * objeto no R2; sem logo, não toca o bucket (idempotente). Conta inexistente
 * (ou de outro Lar) lança — nunca apaga objeto de fora do escopo (#1).
 */
export async function removeLogo(
  repo: BillRepo,
  store: AttachmentStore,
  householdId: string,
  billId: string,
): Promise<Bill> {
  const bill = await repo.obterBill(householdId, billId)
  if (!bill) throw new BillNaoEncontradaError()
  const chaveAntiga = bill.logoKey
  if (!chaveAntiga) return bill

  const atualizada = await repo.definirLogo(householdId, billId, null)
  if (!atualizada) throw new BillNaoEncontradaError()
  await store.remover(chaveAntiga)
  return atualizada
}
