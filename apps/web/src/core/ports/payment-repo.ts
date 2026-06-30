import type { DadosPayment, Payment } from "../domain/payment"

/** Dados de um Lançamento já validados, mais o Lar dono e a Conta de origem. */
export type NovoPayment = DadosPayment & { householdId: string; billId: string }

/**
 * Port de persistência de Lançamentos (ADR-0003). O núcleo depende desta
 * interface, não de Drizzle; um adapter concreto a implementa e os testes usam
 * um fake. Toda operação é escopada pelo `householdId` (o Lar logado) — um
 * Lançamento de outro Lar é invisível, e editar/deletar fora do Lar falha.
 */
export type PaymentRepo = {
  /** Grava um Lançamento e devolve a forma de domínio (com id). */
  criarPayment(novo: NovoPayment): Promise<Payment>
  /** Lista os Lançamentos de uma Conta do Lar, mais recentes primeiro (acesso simétrico, #1). */
  listarPayments(householdId: string, billId: string): Promise<Payment[]>
  /** Lista os Lançamentos de **todas** as Contas do Lar numa só leitura — base dos agregados do cockpit (#22). */
  listarTodosPayments(householdId: string): Promise<Payment[]>
  /** Edita um Lançamento do Lar; `null` se não existe ou é de outro Lar. */
  editarPayment(
    householdId: string,
    paymentId: string,
    dados: DadosPayment,
  ): Promise<Payment | null>
  /** Apaga um Lançamento do Lar; `true` se removeu, `false` se não achou. */
  deletarPayment(householdId: string, paymentId: string): Promise<boolean>
}
