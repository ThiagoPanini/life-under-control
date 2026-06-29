import type { Payment } from "../domain/payment"
import type { PaymentRepo } from "../ports/payment-repo"

/**
 * Use-case: lista os Lançamentos de uma Conta do Lar (mais recentes primeiro).
 * Borda (Server Component) chama isto, nunca o store direto. Acesso simétrico —
 * devolve tudo da Conta, sem filtrar por Pessoa (#1).
 */
export async function listPayments(
  repo: PaymentRepo,
  householdId: string,
  billId: string,
): Promise<Payment[]> {
  return repo.listarPayments(householdId, billId)
}
