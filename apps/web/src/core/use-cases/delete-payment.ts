import type { PaymentRepo } from "../ports/payment-repo"
import { PaymentNaoEncontradoError } from "./edit-payment"

/**
 * Use-case: deleta um Lançamento do Lar — desfaz um registro equivocado. Apaga
 * pelo port; `false` (inexistente ou de outro Lar) vira erro. As duas Pessoas
 * deletam (acesso simétrico, #1); "quem pagou" é autoria, não trava de edição.
 */
export async function deletePayment(
  repo: PaymentRepo,
  householdId: string,
  paymentId: string,
): Promise<void> {
  const removido = await repo.deletarPayment(householdId, paymentId)
  if (!removido) throw new PaymentNaoEncontradoError()
}
