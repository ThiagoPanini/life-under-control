import { describe, expect, it } from "vitest"
import type { PaymentBruto } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakePaymentRepo } from "./payment-repo.fake"
import { PaymentInvalidoError, recordPayment } from "./record-payment"

const clock = (hoje: string): Clock => ({ hoje: () => hoje })

function brutoValido(over: Partial<PaymentBruto> = {}): PaymentBruto {
  return {
    valor: 12990,
    dataPagamento: "2026-06-10",
    competencia: "2026-06",
    paidBy: "p-1",
    ...over,
  }
}

describe("recordPayment (Seam 1)", () => {
  it("test_baixa_persiste_ligada_ao_household_e_a_conta", async () => {
    const repo = fakePaymentRepo()

    const pay = await recordPayment(repo, clock("2026-06-29"), "h-1", "bill-1", brutoValido())

    expect(pay.id).toBeTruthy()
    expect(pay.householdId).toBe("h-1")
    expect(pay.billId).toBe("bill-1")
    expect(pay.valor).toBe(12990)
    expect(await repo.listarPayments("h-1", "bill-1")).toHaveLength(1)
  })

  it("test_data_ausente_usa_o_clock", async () => {
    const repo = fakePaymentRepo()
    const pay = await recordPayment(
      repo,
      clock("2026-06-29"),
      "h-1",
      "bill-1",
      brutoValido({ dataPagamento: "" }),
    )
    expect(pay.dataPagamento).toBe("2026-06-29")
  })

  it("test_data_informada_prevalece_sobre_o_clock", async () => {
    const repo = fakePaymentRepo()
    const pay = await recordPayment(
      repo,
      clock("2026-06-29"),
      "h-1",
      "bill-1",
      brutoValido({ dataPagamento: "2026-05-02" }),
    )
    expect(pay.dataPagamento).toBe("2026-05-02")
  })

  it("test_household_e_bill_vem_da_borda_nao_do_formulario", async () => {
    const repo = fakePaymentRepo()
    const pay = await recordPayment(repo, clock("2026-06-29"), "h-99", "bill-7", brutoValido())
    expect(pay.householdId).toBe("h-99")
    expect(pay.billId).toBe("bill-7")
  })

  it("test_baixa_invalida_lanca_e_nao_persiste", async () => {
    const repo = fakePaymentRepo()

    await expect(
      recordPayment(repo, clock("2026-06-29"), "h-1", "bill-1", brutoValido({ valor: 0 })),
    ).rejects.toBeInstanceOf(PaymentInvalidoError)

    expect(await repo.listarPayments("h-1", "bill-1")).toHaveLength(0)
  })
})
