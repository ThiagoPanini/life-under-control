import type { Payment } from "../domain/payment"
import type { PaymentRepo } from "../ports/payment-repo"

/**
 * Use-case: lista os Lançamentos de **todas** as Contas do Lar numa só leitura —
 * a base dos agregados do cockpit de Finanças (#22), que somam o mês sobre o Lar
 * inteiro. Borda (Server Component) chama isto, nunca o store direto. Acesso
 * simétrico — devolve tudo do Lar, sem filtrar por Pessoa (#1).
 */
export async function listAllPayments(repo: PaymentRepo, householdId: string): Promise<Payment[]> {
  return repo.listarTodosPayments(householdId)
}
