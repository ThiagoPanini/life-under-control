import type { Bill } from "../domain/bill"
import type { BillRepo } from "../ports/bill-repo"

/**
 * Use-case: lista as Contas do Lar. Borda (Server Component) chama isto, nunca o
 * store direto. Acesso simétrico — devolve tudo do Lar, sem filtrar por Pessoa (#1).
 */
export async function listBills(repo: BillRepo, householdId: string): Promise<Bill[]> {
  return repo.listarBills(householdId)
}
