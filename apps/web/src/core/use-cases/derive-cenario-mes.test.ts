import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { derivarCenarioMes } from "./derive-cenario-mes"

const clock = (hoje: string): Clock => ({ hoje: () => hoje })

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

function pagamento(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    householdId: "h-1",
    billId: "bill-1",
    valor: 10000,
    dataPagamento: "2026-07-08",
    competencia: "2026-07",
    paidBy: "p-1",
    ...over,
  }
}

describe("derivarCenarioMes (Seam 1)", () => {
  it("test_tudo_quitado_projecao_exata_e_comparativo_com_mes_anterior", () => {
    const pagos = [
      pagamento({ id: "jul", competencia: "2026-07", valor: 10000 }),
      pagamento({ id: "jun", competencia: "2026-06", valor: 12500, dataPagamento: "2026-06-09" }),
    ]
    const cenario = derivarCenarioMes(clock("2026-07-09"), [billBase()], pagos)

    expect(cenario.competencia).toBe("2026-07")
    expect(cenario.hoje).toBe("2026-07-09")
    expect(cenario.fimDoMes).toBe("2026-07-31")
    expect(cenario.pago).toBe(10000)
    expect(cenario.quitadas).toEqual({ quitadas: 1, total: 1 })
    expect(cenario.pendentes).toBe(0)
    expect(cenario.faltaEstimada).toEqual({ estado: "estimado", valor: 0 })
    expect(cenario.projecao).toEqual({ estado: "exata", valor: 10000 })
    // (10000 − 12500) / 12500 = −20%
    expect(cenario.comparativo).toEqual({
      estado: "comparado",
      mesAnterior: "2026-06",
      percentual: -20,
    })
  })

  it("test_pendentes_somam_media_historica_na_falta_e_projecao_estimada", () => {
    const bills = [billBase({ id: "luz" }), billBase({ id: "agua", nome: "Água" })]
    const pagos = [
      pagamento({ id: "luz-jul", billId: "luz", competencia: "2026-07", valor: 10000 }),
      pagamento({ id: "agua-jun", billId: "agua", competencia: "2026-06", valor: 4000 }),
      pagamento({ id: "agua-mai", billId: "agua", competencia: "2026-05", valor: 6000 }),
    ]
    const cenario = derivarCenarioMes(clock("2026-07-09"), bills, pagos)

    // água pendente: média(4000, 6000) = 5000 ainda estimados até o fim do mês
    expect(cenario.quitadas).toEqual({ quitadas: 1, total: 2 })
    expect(cenario.pendentes).toBe(1)
    expect(cenario.faltaEstimada).toEqual({ estado: "estimado", valor: 5000 })
    expect(cenario.projecao).toEqual({ estado: "estimada", valor: 15000 })
    // junho pagou só 4000 → projeção 15000 = +275%
    expect(cenario.comparativo).toEqual({
      estado: "comparado",
      mesAnterior: "2026-06",
      percentual: 275,
    })
  })

  it("test_pendente_sem_historico_nao_vira_zero", () => {
    const cenario = derivarCenarioMes(clock("2026-07-09"), [billBase()], [])

    expect(cenario.pago).toBe(0)
    expect(cenario.pendentes).toBe(1)
    expect(cenario.faltaEstimada).toEqual({ estado: "sem-historico" })
    expect(cenario.projecao).toEqual({ estado: "sem-estimativa" })
    expect(cenario.comparativo).toEqual({ estado: "sem-base" })
  })

  it("test_mes_anterior_sem_pago_comparativo_sem_base", () => {
    const pagos = [pagamento({ id: "jul", competencia: "2026-07", valor: 10000 })]
    const cenario = derivarCenarioMes(clock("2026-07-09"), [billBase()], pagos)

    expect(cenario.projecao).toEqual({ estado: "exata", valor: 10000 })
    expect(cenario.comparativo).toEqual({ estado: "sem-base" })
  })

  it("test_conta_fora_de_fase_nao_entra_no_universo_do_mes", () => {
    // Anual ancorada em agosto: julho não é ocorrência — não vira quitada nem pendente.
    const anual = billBase({
      id: "seguro",
      nome: "Seguro",
      recurrence: { intervalMonths: 12, anchorMonth: 8 },
    })
    const cenario = derivarCenarioMes(clock("2026-07-09"), [billBase(), anual], [])

    expect(cenario.quitadas.total).toBe(1)
    expect(cenario.pendentes).toBe(1)
  })
})
