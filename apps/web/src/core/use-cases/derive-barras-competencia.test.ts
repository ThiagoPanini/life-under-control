import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import { serieTotalPago } from "./derive-agregados-financas"
import { pontosBarraCompetencia, valoresFechados } from "./derive-barras-competencia"

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

describe("pontosBarraCompetencia (Seam 1)", () => {
  it("test_mes_fechado_com_pagamento_vira_estado_fechado", () => {
    const bills = [billBase()]
    const pagos = [pagamento({ competencia: "2026-04", valor: 5000 })]
    const serie = serieTotalPago(bills, pagos, "2026-06-15", 3)

    const pontos = pontosBarraCompetencia(serie, bills, "2026-06-15")

    expect(pontos).toEqual([
      { competencia: "2026-04", valor: 5000, estado: "fechado" },
      { competencia: "2026-05", valor: 0, estado: "fechado" },
      { competencia: "2026-06", valor: 0, estado: "em-curso" },
    ])
  })

  it("test_mes_corrente_vira_estado_em_curso_mesmo_com_valor_pago", () => {
    const bills = [billBase()]
    const pagos = [pagamento({ competencia: "2026-06", valor: 3000 })]
    const serie = serieTotalPago(bills, pagos, "2026-06-15", 1)

    const pontos = pontosBarraCompetencia(serie, bills, "2026-06-15")

    expect(pontos).toEqual([{ competencia: "2026-06", valor: 3000, estado: "em-curso" }])
  })

  it("test_mes_fechado_sem_ocorrencia_esperada_vira_lacuna_nao_zero", () => {
    // Conta trimestral (âncora em junho): só espera ocorrência a cada 3 meses.
    const bills = [billBase({ recurrence: { intervalMonths: 3, anchorMonth: 6 } })]
    const pagos = [pagamento({ competencia: "2026-06", valor: 9000 })]
    const serie = serieTotalPago(bills, pagos, "2026-08-15", 3)

    const pontos = pontosBarraCompetencia(serie, bills, "2026-08-15")

    expect(pontos).toEqual([
      { competencia: "2026-06", valor: 9000, estado: "fechado" },
      { competencia: "2026-07", valor: 0, estado: "lacuna" },
      { competencia: "2026-08", valor: 0, estado: "em-curso" },
    ])
  })

  it("test_mes_fechado_com_ocorrencia_esperada_mas_nao_paga_fica_fechado_zero_nao_lacuna", () => {
    // Conta mensal: maio era esperado (mensal cobre todo mês) mas ninguém pagou — fato real, não lacuna.
    const bills = [billBase()]
    const serie = serieTotalPago(bills, [], "2026-06-15", 2)

    const pontos = pontosBarraCompetencia(serie, bills, "2026-06-15")

    expect(pontos).toEqual([
      { competencia: "2026-05", valor: 0, estado: "fechado" },
      { competencia: "2026-06", valor: 0, estado: "em-curso" },
    ])
  })

  it("test_serie_vazia_vira_lista_vazia", () => {
    const serie = serieTotalPago([], [], "2026-06-15")
    expect(pontosBarraCompetencia(serie, [], "2026-06-15")).toEqual([])
  })

  it("test_conta_encerrada_com_competencia_esperada_antes_do_fechamento_fica_fechado_nao_lacuna", () => {
    // A Conta trimestral (âncora junho) segue ativa mas não espera nada em abr/mai — só a
    // encerrada esperava (mensal) antes de fechar em 20/04. Abril tem que ficar "fechado"
    // (fato real: esperava e não pagou), nunca "lacuna" (que diria que nada esperava ali).
    const billAtiva = billBase({
      id: "bill-ativa",
      recurrence: { intervalMonths: 3, anchorMonth: 6 },
    })
    const billEncerrada = billBase({
      id: "bill-encerrada",
      estado: "encerrada",
      encerradaEm: "2026-04-20",
    })
    const bills = [billAtiva, billEncerrada]
    const serie = serieTotalPago(bills, [], "2026-06-15", 3)

    const pontos = pontosBarraCompetencia(serie, bills, "2026-06-15")

    expect(pontos.find((p) => p.competencia === "2026-04")).toEqual({
      competencia: "2026-04",
      valor: 0,
      estado: "fechado",
    })
  })

  it("test_conta_encerrada_nao_gera_expectativa_apos_o_proprio_fechamento", () => {
    // Maio já é depois do fechamento (20/04) da encerrada — ela não pode "esperar" ali.
    const billAtiva = billBase({
      id: "bill-ativa",
      recurrence: { intervalMonths: 3, anchorMonth: 6 },
    })
    const billEncerrada = billBase({
      id: "bill-encerrada",
      estado: "encerrada",
      encerradaEm: "2026-04-20",
    })
    const bills = [billAtiva, billEncerrada]
    const serie = serieTotalPago(bills, [], "2026-06-15", 3)

    const pontos = pontosBarraCompetencia(serie, bills, "2026-06-15")

    expect(pontos.find((p) => p.competencia === "2026-05")).toEqual({
      competencia: "2026-05",
      valor: 0,
      estado: "lacuna",
    })
  })
})

describe("valoresFechados (Seam 1)", () => {
  it("test_exclui_em_curso_e_lacuna_mantem_so_fechado", () => {
    const pontos = [
      { competencia: "2026-04", valor: 5000, estado: "fechado" as const },
      { competencia: "2026-05", valor: 0, estado: "lacuna" as const },
      { competencia: "2026-06", valor: 3000, estado: "em-curso" as const },
    ]
    expect(valoresFechados(pontos)).toEqual([5000])
  })

  it("test_fechado_com_zero_pago_entra_como_zero_real", () => {
    const pontos = [{ competencia: "2026-05", valor: 0, estado: "fechado" as const }]
    expect(valoresFechados(pontos)).toEqual([0])
  })
})
