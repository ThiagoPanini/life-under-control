import { type Bill, type BillBruto, type ErroCampo, validarDadosBill } from "../domain/bill"
import type { BillRepo } from "../ports/bill-repo"

/** O cadastro não passou na validação de domínio — carrega os erros por campo. */
export class BillInvalidaError extends Error {
  constructor(readonly erros: ErroCampo[]) {
    super("Conta inválida")
    this.name = "BillInvalidaError"
  }
}

/**
 * Use-case: cadastra uma Conta no Lar. Valida a regra (forma + offset + âncora)
 * no núcleo e persiste atravessando o port — nunca o store direto. O `householdId`
 * vem da borda (o Lar logado), não do formulário. Qualquer Pessoa cadastra (#1).
 */
export async function createBill(
  repo: BillRepo,
  householdId: string,
  bruto: BillBruto,
): Promise<Bill> {
  const res = validarDadosBill(bruto)
  if (!res.ok) throw new BillInvalidaError(res.erros)
  return repo.criarBill({ ...res.value, householdId })
}
