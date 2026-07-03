import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { derivarInsightsCompetencia } from "./derive-insights-competencia"

const clock = (hoje: string): Clock => ({ hoje: () => hoje })

function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    householdId: "h-1",
    nome: "Luz",
    descricao: null,
    icon: "zap",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    estado: "ativa",
    encerradaEm: null,
    logoKey: null,
    ...over,
  }
}

function payment(over: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    householdId: "h-1",
    billId: "bill-1",
    valor: 10_000,
    dataPagamento: "2026-07-08",
    competencia: "2026-07",
    paidBy: "p-1",
    ...over,
  }
}

describe("derivarInsightsCompetencia (Seam 1)", () => {
  it("test_competencia_em_curso_nao_calcula_variacao", () => {
    const payments = [
      payment({ id: "jun", competencia: "2026-06", valor: 9_000 }),
      payment({ id: "jul", competencia: "2026-07", valor: 10_000 }),
    ]

    const insights = derivarInsightsCompetencia(clock("2026-07-02"), [bill()], payments, "2026-07")

    expect(insights.estadoCompetencia).toBe("em-curso")
    expect(insights.dataReferencia).toBe("2026-07-02")
    expect(insights.comparacao).toEqual({ estado: "em-curso" })
  })

  it("test_competencia_fechada_destaca_maior_alta_e_maior_queda_com_base_real", () => {
    const bills = [
      bill({ id: "luz", nome: "Luz" }),
      bill({ id: "internet", nome: "Internet" }),
      bill({ id: "agua", nome: "Água" }),
    ]
    const payments = [
      payment({ id: "luz-mai", billId: "luz", competencia: "2026-05", valor: 10_000 }),
      payment({ id: "luz-jun-a", billId: "luz", competencia: "2026-06", valor: 9_000 }),
      payment({ id: "luz-jun-b", billId: "luz", competencia: "2026-06", valor: 6_000 }),
      payment({ id: "net-mai", billId: "internet", competencia: "2026-05", valor: 20_000 }),
      payment({ id: "net-jun", billId: "internet", competencia: "2026-06", valor: 15_000 }),
      // Sem Lançamento em maio: Água é lacuna, não uma base zero para alta infinita.
      payment({ id: "agua-jun", billId: "agua", competencia: "2026-06", valor: 30_000 }),
    ]

    const insights = derivarInsightsCompetencia(clock("2026-07-02"), bills, payments, "2026-06")

    expect(insights.estadoCompetencia).toBe("fechada")
    expect(insights.dataReferencia).toBe("2026-06-30")
    expect(insights.comparacao).toEqual({
      estado: "calculada",
      competenciaAnterior: "2026-05",
      maiorAlta: {
        contaId: "luz",
        titulo: "Luz",
        valorAnterior: 10_000,
        valorAtual: 15_000,
        deltaValor: 5_000,
        deltaPercentual: 50,
      },
      maiorQueda: {
        contaId: "internet",
        titulo: "Internet",
        valorAnterior: 20_000,
        valorAtual: 15_000,
        deltaValor: -5_000,
        deltaPercentual: -25,
      },
    })
  })

  it("test_leituras_do_mes_usam_lancamentos_e_respeitam_ocorrencias_da_conta", () => {
    const bills = [
      bill({ id: "luz", nome: "Luz" }),
      bill({ id: "internet", nome: "Internet" }),
      bill({ id: "agua", nome: "Água" }),
      bill({
        id: "iptu",
        nome: "IPTU",
        recurrence: { intervalMonths: 12, anchorMonth: 1 },
      }),
    ]
    const payments = [
      payment({ id: "luz-a", billId: "luz", competencia: "2026-06", valor: 9_000 }),
      payment({ id: "luz-b", billId: "luz", competencia: "2026-06", valor: 6_000 }),
      payment({ id: "net", billId: "internet", competencia: "2026-06", valor: 14_000 }),
    ]

    const insights = derivarInsightsCompetencia(clock("2026-07-02"), bills, payments, "2026-06")

    expect(insights.maiorLancamento).toEqual({
      paymentId: "net",
      contaId: "internet",
      titulo: "Internet",
      valor: 14_000,
    })
    expect(insights.semLancamento).toEqual({
      quantidade: 1,
      contas: [{ contaId: "agua", titulo: "Água" }],
    })
    expect(insights.concentracaoTresMaiores).toBe(100)
  })
})
