import { type Payment, type PaymentBruto, validarDadosPayment } from "../domain/payment"
import type { PaymentRepo } from "../ports/payment-repo"
import { PaymentInvalidoError } from "./record-payment"

/** O Lançamento-alvo não existe no Lar (id inexistente ou de outro Lar). */
export class PaymentNaoEncontradoError extends Error {
  constructor() {
    super("Lançamento não encontrado")
    this.name = "PaymentNaoEncontradoError"
  }
}

/**
 * Use-case: corrige um Lançamento do Lar (valor, data, competência, quem pagou).
 * A imutabilidade da invariante #4 é do *sistema* (reajustar a Conta nunca
 * reescreve um Lançamento), não trava a Pessoa de corrigir o que registrou — as
 * duas editam tudo (acesso simétrico, #1). Valida no núcleo e persiste pelo port.
 * Sem `Clock`: limpar a data significa null ("pago sem data"), nunca hoje.
 */
export async function editPayment(
  repo: PaymentRepo,
  householdId: string,
  paymentId: string,
  bruto: PaymentBruto,
): Promise<Payment> {
  const res = validarDadosPayment(bruto)
  if (!res.ok) throw new PaymentInvalidoError(res.erros)
  const atualizado = await repo.editarPayment(householdId, paymentId, res.value)
  if (!atualizado) throw new PaymentNaoEncontradoError()
  return atualizado
}
