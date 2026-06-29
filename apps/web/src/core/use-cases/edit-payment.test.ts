import { describe, expect, it } from "vitest"
import type { Payment, PaymentBruto } from "@/core/domain/payment"
import { editPayment, PaymentNaoEncontradoError } from "./edit-payment"
import { fakePaymentRepo } from "./payment-repo.fake"
import { PaymentInvalidoError } from "./record-payment"

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

function bruto(over: Partial<PaymentBruto> = {}): PaymentBruto {
  return {
    valor: 13050,
    dataPagamento: "2026-06-09",
    competencia: "2026-06",
    paidBy: "p-2",
    ...over,
  }
}

describe("editPayment (Seam 1)", () => {
  it("test_edita_persiste_a_nova_forma", async () => {
    const repo = fakePaymentRepo([existente()])

    const atualizado = await editPayment(repo, "h-1", "pay-1", bruto())

    expect(atualizado.valor).toBe(13050)
    expect(atualizado.competencia).toBe("2026-06")
    expect(atualizado.paidBy).toBe("p-2")
    expect(atualizado.id).toBe("pay-1")
  })

  it("test_limpar_a_data_vira_null_nao_hoje", async () => {
    // Editar não reescreve o passado: limpar a data marca "pago sem data" (null),
    // jamais carimba hoje por cima do que a Pessoa registrou (review #2).
    const repo = fakePaymentRepo([existente()])
    const atualizado = await editPayment(repo, "h-1", "pay-1", bruto({ dataPagamento: "" }))
    expect(atualizado.dataPagamento).toBeNull()
  })

  it("test_editar_inexistente_lanca", async () => {
    const repo = fakePaymentRepo([existente()])
    await expect(editPayment(repo, "h-1", "pay-404", bruto())).rejects.toBeInstanceOf(
      PaymentNaoEncontradoError,
    )
  })

  it("test_editar_de_outro_lar_lanca", async () => {
    const repo = fakePaymentRepo([existente()])
    await expect(editPayment(repo, "h-outro", "pay-1", bruto())).rejects.toBeInstanceOf(
      PaymentNaoEncontradoError,
    )
  })

  it("test_edicao_invalida_lanca", async () => {
    const repo = fakePaymentRepo([existente()])
    await expect(editPayment(repo, "h-1", "pay-1", bruto({ valor: -1 }))).rejects.toBeInstanceOf(
      PaymentInvalidoError,
    )
  })
})
