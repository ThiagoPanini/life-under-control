import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { derivarLinhaConta, derivarLinhasContas } from "./derive-linha-conta"

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
    dataPagamento: "2026-06-08",
    competencia: "2026-06",
    paidBy: "p-1",
    ...over,
  }
}

describe("derivarLinhaConta (Seam 1)", () => {
  it("test_row_valor_real_quando_quitada", () => {
    const linha = derivarLinhaConta(clock("2026-07-10"), fakeCalendar(), billBase(), [
      pagamento({ competencia: "2026-07", valor: 5000, dataPagamento: "2026-07-10" }),
    ])
    expect(linha.valor).toEqual({ estado: "real", valor: 5000 })
    expect(linha.vencimento).toBe("2026-07-10")
  })

  it("test_row_estimativa_media_quando_em_aberto", () => {
    // dia 10, hoje 10: a competência vigente venceu hoje sem Lançamento — em aberto.
    const linha = derivarLinhaConta(clock("2026-07-10"), fakeCalendar(), billBase(), [
      pagamento({ id: "p-05", competencia: "2026-05", valor: 6000, dataPagamento: "2026-05-08" }),
      pagamento({ id: "p-06", competencia: "2026-06", valor: 4000, dataPagamento: "2026-06-08" }),
    ])
    expect(linha.valor).toEqual({ estado: "estimativa", media: 5000 })
  })

  it("test_row_autoria_de_quem_pagou", () => {
    const quitada = derivarLinhaConta(clock("2026-07-10"), fakeCalendar(), billBase(), [
      pagamento({ competencia: "2026-07", valor: 5000, paidBy: "jakeline" }),
    ])
    expect(quitada.autoria).toBe("jakeline")

    const emAberto = derivarLinhaConta(clock("2026-07-10"), fakeCalendar(), billBase(), [])
    expect(emAberto.autoria).toBeNull()
  })

  it("test_row_seis_estados_do_grid", () => {
    // hoje dia 5: a competência vigente (07) ainda não venceu — aguardando.
    const linha = derivarLinhaConta(clock("2026-07-05"), fakeCalendar(), billBase(), [
      pagamento({ id: "p-08", competencia: "2025-08", dataPagamento: null }), // pago-sem-data
      pagamento({ id: "p-09", competencia: "2025-09", dataPagamento: "2025-09-10" }), // em-dia
      pagamento({ id: "p-10", competencia: "2025-10", dataPagamento: "2025-10-12" }), // atraso-leve
      pagamento({ id: "p-11", competencia: "2025-11", dataPagamento: "2025-11-25" }), // atraso
      // "2025-12" sem Lançamento, já vencida (hoje é julho/2026) — em-aberto
      // "2026-07" (vigente) sem Lançamento, ainda não venceu — aguardando
    ])
    const estados = new Set(linha.grid.map((celula) => celula.estado))
    expect(estados).toEqual(
      new Set(["em-dia", "atraso-leve", "atraso", "em-aberto", "aguardando", "pago-sem-data"]),
    )
  })

  it("test_grid_ultimas_12_ocorrencias_nao_meses", () => {
    // Conta anual (âncora janeiro): as últimas 12 ocorrências são 12 janeiros, não 12 meses.
    const anual = billBase({ recurrence: { intervalMonths: 12, anchorMonth: 1 } })
    const linha = derivarLinhaConta(clock("2026-07-10"), fakeCalendar(), anual, [])

    expect(linha.grid).toHaveLength(12)
    expect(linha.grid.every((celula) => celula.competencia.endsWith("-01"))).toBe(true)
    const anos = linha.grid.map((celula) => Number(celula.competencia.slice(0, 4)))
    expect(anos).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
  })
})

describe("derivarLinhasContas (Seam 1)", () => {
  it("test_row_ordenacao_por_urgencia", () => {
    const vermelho = billBase({ id: "b-vermelho", dueRule: { kind: "dia-fixo", day: 5 } })
    const amarelo = billBase({ id: "b-amarelo", dueRule: { kind: "dia-fixo", day: 12 } })
    const verde = billBase({ id: "b-verde", dueRule: { kind: "dia-fixo", day: 20 } })

    const linhas = derivarLinhasContas(
      clock("2026-07-10"),
      fakeCalendar(),
      [verde, amarelo, vermelho],
      [pagamento({ billId: "b-verde", competencia: "2026-07", valor: 1000 })],
    )

    expect(linhas.map((linha) => linha.billId)).toEqual(["b-vermelho", "b-amarelo", "b-verde"])
  })
})
