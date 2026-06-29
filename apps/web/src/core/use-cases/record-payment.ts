import type { ErroCampo } from "../domain/bill"
import { type Payment, type PaymentBruto, validarDadosPayment } from "../domain/payment"
import type { Clock } from "../ports/clock"
import type { PaymentRepo } from "../ports/payment-repo"

/** A baixa não passou na validação de domínio — carrega os erros por campo. */
export class PaymentInvalidoError extends Error {
  constructor(readonly erros: ErroCampo[]) {
    super("Lançamento inválido")
    this.name = "PaymentInvalidoError"
  }
}

/**
 * Use-case: dá baixa numa Conta, registrando um Lançamento. Valida a forma no
 * núcleo (valor positivo em centavos, competência, quem pagou) e persiste pelo
 * port — nunca o store direto. A data de pagamento ausente assume **hoje** via o
 * `Clock` injetado (determinístico no teste). `householdId` e `billId` vêm da
 * borda (o Lar logado e a Conta da URL), nunca do formulário. Qualquer Pessoa dá
 * baixa (#1). Não trava por competência repetida — o aviso é da borda (Seam 3).
 */
export async function recordPayment(
  repo: PaymentRepo,
  clock: Clock,
  householdId: string,
  billId: string,
  bruto: PaymentBruto,
): Promise<Payment> {
  const res = validarDadosPayment(bruto)
  if (!res.ok) throw new PaymentInvalidoError(res.erros)
  // A baixa sem data informada assume hoje (via Clock) — o default é desta
  // operação, não da validação (que mantém o null da edição intacto).
  const dataPagamento = res.value.dataPagamento ?? clock.hoje()
  return repo.criarPayment({ ...res.value, dataPagamento, householdId, billId })
}
