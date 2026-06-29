import { describe, expect, it } from "vitest"
import {
  descreverCompetencia,
  ehCompetenciaValida,
  type PaymentBruto,
  validarDadosPayment,
} from "./payment"

function brutoValido(over: Partial<PaymentBruto> = {}): PaymentBruto {
  return {
    valor: 12990,
    dataPagamento: "2026-06-10",
    competencia: "2026-06",
    paidBy: "p-1",
    ...over,
  }
}

function campos(r: ReturnType<typeof validarDadosPayment>): string[] {
  return r.ok ? [] : r.erros.map((e) => e.campo)
}

describe("ehCompetenciaValida", () => {
  it("test_aceita_ano_mes", () => {
    expect(ehCompetenciaValida("2026-06")).toBe(true)
    expect(ehCompetenciaValida("2026-01")).toBe(true)
    expect(ehCompetenciaValida("2026-12")).toBe(true)
  })

  it("test_recusa_formato_torto", () => {
    expect(ehCompetenciaValida("2026-13")).toBe(false)
    expect(ehCompetenciaValida("2026-00")).toBe(false)
    expect(ehCompetenciaValida("2026-6")).toBe(false)
    expect(ehCompetenciaValida("06/2026")).toBe(false)
    expect(ehCompetenciaValida("")).toBe(false)
  })
})

describe("validarDadosPayment (Seam 1)", () => {
  it("test_baixa_valida_normaliza", () => {
    const r = validarDadosPayment(brutoValido())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.valor).toBe(12990)
      expect(r.value.dataPagamento).toBe("2026-06-10")
      expect(r.value.competencia).toBe("2026-06")
      expect(r.value.paidBy).toBe("p-1")
    }
  })

  it("test_data_vazia_vira_null", () => {
    // O default "hoje" é da baixa (recordPayment, via Clock), não da validação:
    // vazio aqui é null ("pago sem data"), pra editar não reescrever o passado.
    const r = validarDadosPayment(brutoValido({ dataPagamento: "" }))
    expect(r.ok && r.value.dataPagamento).toBeNull()
    const r2 = validarDadosPayment(brutoValido({ dataPagamento: null }))
    expect(r2.ok && r2.value.dataPagamento).toBeNull()
  })

  it("test_valor_nao_positivo_ou_quebrado_falha", () => {
    expect(campos(validarDadosPayment(brutoValido({ valor: 0 })))).toContain("valor")
    expect(campos(validarDadosPayment(brutoValido({ valor: -5 })))).toContain("valor")
    expect(campos(validarDadosPayment(brutoValido({ valor: 1.5 })))).toContain("valor")
    expect(campos(validarDadosPayment(brutoValido({ valor: Number.NaN })))).toContain("valor")
  })

  it("test_data_invalida_falha", () => {
    expect(campos(validarDadosPayment(brutoValido({ dataPagamento: "31/06/2026" })))).toContain(
      "dataPagamento",
    )
    expect(campos(validarDadosPayment(brutoValido({ dataPagamento: "2026-02-30" })))).toContain(
      "dataPagamento",
    )
  })

  it("test_competencia_invalida_falha", () => {
    expect(campos(validarDadosPayment(brutoValido({ competencia: "2026-13" })))).toContain(
      "competencia",
    )
  })

  it("test_quem_pagou_obrigatorio", () => {
    expect(campos(validarDadosPayment(brutoValido({ paidBy: "" })))).toContain("paidBy")
  })
})

describe("descreverCompetencia", () => {
  it("test_mensal_mostra_mes_e_ano", () => {
    expect(descreverCompetencia("2026-07", { intervalMonths: 1, anchorMonth: null })).toBe(
      "Julho/2026",
    )
  })

  it("test_anual_mostra_so_o_ano", () => {
    expect(descreverCompetencia("2026-03", { intervalMonths: 12, anchorMonth: 3 })).toBe("2026")
  })

  it("test_outras_periodicidades_mostram_mes_e_ano", () => {
    expect(descreverCompetencia("2026-07", { intervalMonths: 2, anchorMonth: 7 })).toBe(
      "Julho/2026",
    )
  })
})
