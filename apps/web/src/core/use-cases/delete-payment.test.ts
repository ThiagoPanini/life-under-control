import { describe, expect, it } from "vitest"
import type { Payment } from "@/core/domain/payment"
import { deletePayment } from "./delete-payment"
import { PaymentNaoEncontradoError } from "./edit-payment"
import { fakePaymentRepo } from "./payment-repo.fake"

function existente(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    householdId: "h-1",
    billId: "bill-1",
    valor: 10000,
    dataPagamento: "2026-05-10",
    competencia: "2026-05",
    paidBy: "p-1",
    ...over,
  }
}

describe("deletePayment (Seam 1)", () => {
  it("test_deleta_remove_do_lar", async () => {
    const repo = fakePaymentRepo([existente()])

    await deletePayment(repo, "h-1", "pay-1")

    expect(await repo.listarPayments("h-1", "bill-1")).toHaveLength(0)
  })

  it("test_deletar_inexistente_lanca", async () => {
    const repo = fakePaymentRepo([existente()])
    await expect(deletePayment(repo, "h-1", "pay-404")).rejects.toBeInstanceOf(
      PaymentNaoEncontradoError,
    )
  })

  it("test_deletar_de_outro_lar_lanca", async () => {
    const repo = fakePaymentRepo([existente()])
    await expect(deletePayment(repo, "h-outro", "pay-1")).rejects.toBeInstanceOf(
      PaymentNaoEncontradoError,
    )
  })
})
