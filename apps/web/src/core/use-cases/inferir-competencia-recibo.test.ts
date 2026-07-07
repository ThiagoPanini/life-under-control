import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import { fakeCalendar } from "./calendar.fake"
import { inferirCompetenciaRecibo } from "./inferir-competencia-recibo"

/** Conta mensal, dia-fixo 10, sem offset — base que cada teste muta. */
function billBase(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    householdId: "h-1",
    nome: "Luz",
    descricao: null,
    icon: "zap",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    primeiraCompetencia: "2020-01",
    estado: "ativa",
    encerradaEm: null,
    logoKey: null,
    ...over,
  }
}

describe("inferirCompetenciaRecibo (WhatsApp fase 1, #162)", () => {
  const cal = fakeCalendar()
  const payments: Payment[] = []

  it("test_vencimento_impresso_que_casa_retorna_a_competencia_correspondente", () => {
    const competencia = inferirCompetenciaRecibo(
      billBase(),
      payments,
      "2026-06-15",
      cal,
      "2026-06-10",
    )
    expect(competencia).toBe("2026-06")
  })

  it("test_vencimento_ilegivel_cai_na_ocorrencia_em_aberto_mais_antiga", () => {
    // sem nenhum Lançamento na janela de 12 meses, a mais antiga (2025-07) é o buraco
    const competencia = inferirCompetenciaRecibo(billBase(), payments, "2026-06-15", cal, null)
    expect(competencia).toBe("2025-07")
  })

  it("test_conta_com_due_month_offset_casa_vencimento_deslocado", () => {
    // condomínio de janeiro com offset +1 vence em 08/fev — recibo traz o vencimento impresso
    const bill = billBase({ dueRule: { kind: "dia-fixo", day: 8 }, dueMonthOffset: 1 })
    const competencia = inferirCompetenciaRecibo(bill, payments, "2026-02-10", cal, "2026-02-08")
    expect(competencia).toBe("2026-01")
  })
})
