import type { Payment } from "@/core/domain/payment"
import type { NovoPayment, PaymentRepo } from "@/core/ports/payment-repo"

/**
 * Fake do `PaymentRepo` para o Seam 1 — um store em memória que honra o escopo
 * por Lar (operar fora do `householdId` não acha o Lançamento), partilhado pelos
 * testes dos use-cases de baixa. Sem banco: a regra mora no núcleo (ADR-0003).
 */
export function fakePaymentRepo(seed: Payment[] = []): PaymentRepo {
  const store = new Map<string, Payment>(seed.map((p) => [p.id, p]))
  let n = seed.length

  return {
    async criarPayment(novo: NovoPayment): Promise<Payment> {
      n += 1
      const pay: Payment = { id: `pay-${n}`, ...novo }
      store.set(pay.id, pay)
      return pay
    },
    async listarPayments(householdId, billId) {
      return [...store.values()].filter((p) => p.householdId === householdId && p.billId === billId)
    },
    async editarPayment(householdId, paymentId, dados) {
      const atual = store.get(paymentId)
      if (!atual || atual.householdId !== householdId) return null
      const atualizado: Payment = { ...atual, ...dados }
      store.set(paymentId, atualizado)
      return atualizado
    },
    async deletarPayment(householdId, paymentId) {
      const atual = store.get(paymentId)
      if (!atual || atual.householdId !== householdId) return false
      store.delete(paymentId)
      return true
    },
  }
}
