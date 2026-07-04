import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import {
  compararMesFechado,
  contarContasEmAberto,
  derivarAgregadosFinancas,
  estimarFaltaPagar,
  gastoMensalMedio,
  serieTotalPago,
  totalPagoNoMes,
} from "./derive-agregados-financas"

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
    dataPagamento: "2026-06-08",
    competencia: "2026-06",
    paidBy: "p-1",
    ...over,
  }
}

describe("totalPagoNoMes (Seam 1)", () => {
  it("test_soma_exata_dos_lancamentos_da_competencia_vigente", () => {
    const bills = [billBase({ id: "bill-1" }), billBase({ id: "bill-2", nome: "Água" })]
    const pagos = [
      pagamento({ id: "a", billId: "bill-1", competencia: "2026-06", valor: 10000 }),
      pagamento({ id: "b", billId: "bill-2", competencia: "2026-06", valor: 7000 }),
      // mês anterior: fora da competência vigente, não soma
      pagamento({ id: "c", billId: "bill-1", competencia: "2026-05", valor: 9999 }),
    ]
    expect(totalPagoNoMes(bills, pagos, "2026-06-15")).toBe(17000)
  })

  it("test_ignora_lancamentos_de_conta_encerrada", () => {
    const bills = [
      billBase({ id: "bill-1" }),
      billBase({ id: "bill-2", estado: "encerrada", encerradaEm: "2026-05-01" }),
    ]
    const pagos = [
      pagamento({ id: "a", billId: "bill-1", competencia: "2026-06", valor: 10000 }),
      pagamento({ id: "b", billId: "bill-2", competencia: "2026-06", valor: 5000 }),
    ]
    expect(totalPagoNoMes(bills, pagos, "2026-06-15")).toBe(10000)
  })

  it("test_sem_pagamento_no_mes_soma_zero", () => {
    const pagos = [pagamento({ competencia: "2026-05", valor: 5000 })]
    expect(totalPagoNoMes([billBase()], pagos, "2026-06-15")).toBe(0)
  })
})

describe("serieTotalPago (Seam 1)", () => {
  it("test_monta_seis_competencias_em_ordem_com_zeros_explicitos", () => {
    const bills = [
      billBase({ id: "ativa" }),
      billBase({ id: "encerrada", estado: "encerrada", encerradaEm: "2026-01-01" }),
    ]
    const pagos = [
      pagamento({ id: "abr", billId: "ativa", competencia: "2026-04", valor: 4000 }),
      pagamento({ id: "jun", billId: "ativa", competencia: "2026-06", valor: 6000 }),
      pagamento({ id: "fora", billId: "encerrada", competencia: "2026-05", valor: 99999 }),
    ]

    expect(serieTotalPago(bills, pagos, "2026-06-15", 6)).toEqual({
      estado: "com-dados",
      pontos: [
        { competencia: "2026-01", valor: 0, emCurso: false },
        { competencia: "2026-02", valor: 0, emCurso: false },
        { competencia: "2026-03", valor: 0, emCurso: false },
        { competencia: "2026-04", valor: 4000, emCurso: false },
        { competencia: "2026-05", valor: 0, emCurso: false },
        { competencia: "2026-06", valor: 6000, emCurso: true },
      ],
    })
  })

  it("test_serie_marca_mes_corrente_em_curso", () => {
    const pagos = [pagamento({ competencia: "2026-06", valor: 6000 })]
    const serie = serieTotalPago([billBase()], pagos, "2026-06-15", 2)
    expect(serie).toEqual({
      estado: "com-dados",
      pontos: [
        { competencia: "2026-05", valor: 0, emCurso: false },
        { competencia: "2026-06", valor: 6000, emCurso: true },
      ],
    })
  })

  it("test_serie_vazia_shape_explicito", () => {
    // Lar sem nenhuma Conta ativa: shape explícito, não seis meses de zero disfarçando "sem Conta".
    expect(serieTotalPago([], [], "2026-06-15")).toEqual({ estado: "vazia" })
  })
})

describe("compararMesFechado (Seam 1)", () => {
  it("test_mes_corrente_sem_delta_em_curso", () => {
    // só o mês corrente tem ponto na série — nenhum mês fechado ainda pra comparar
    const pagos = [pagamento({ competencia: "2026-06", valor: 5000 })]
    const serie = serieTotalPago([billBase()], pagos, "2026-06-15", 1)
    expect(compararMesFechado(serie)).toEqual({ estado: "em-curso" })
  })

  it("test_delta_so_entre_meses_fechados", () => {
    // junho (corrente) tem valor discrepante; o delta ignora e compara só maio vs abril
    const pagos = [
      pagamento({ id: "abr", competencia: "2026-04", valor: 4000 }),
      pagamento({ id: "mai", competencia: "2026-05", valor: 5000 }),
      pagamento({ id: "jun", competencia: "2026-06", valor: 999999 }),
    ]
    const serie = serieTotalPago([billBase()], pagos, "2026-06-15", 3)
    expect(compararMesFechado(serie)).toEqual({ estado: "fechado", deltaPercentual: 25 })
  })

  it("test_mes_vazio_nao_gera_menos_100", () => {
    // 1º de julho: julho (corrente) ainda não tem nenhum Lançamento — não é "queda de 100%"
    const pagos = [
      pagamento({ id: "mai", competencia: "2026-05", valor: 4000 }),
      pagamento({ id: "jun", competencia: "2026-06", valor: 5000 }),
    ]
    const serie = serieTotalPago([billBase()], pagos, "2026-07-01", 3)
    expect(compararMesFechado(serie)).toEqual({ estado: "fechado", deltaPercentual: 25 })
  })

  it("test_mes_fechado_sem_base_anterior_nao_gera_percentual", () => {
    // mês anterior fechado sem nenhum Lançamento: sem base honesta pra divisão
    const pagos = [pagamento({ id: "jun", competencia: "2026-06", valor: 5000 })]
    const serie = serieTotalPago([billBase()], pagos, "2026-06-15", 3)
    expect(compararMesFechado(serie)).toEqual({ estado: "sem-base-anterior" })
  })

  it("test_serie_vazia_fica_em_curso", () => {
    expect(compararMesFechado(serieTotalPago([], [], "2026-06-15"))).toEqual({ estado: "em-curso" })
  })
})

describe("contarContasEmAberto (Seam 1)", () => {
  const cal = fakeCalendar()

  it("test_conta_so_farois_amarelo_e_vermelho", () => {
    // hoje 15/06: venc 10 → vermelho; venc 18 (3 dias) → amarelo; venc 25 (10 dias) → cinza
    const bills = [
      billBase({ id: "vermelho", dueRule: { kind: "dia-fixo", day: 10 } }),
      billBase({ id: "amarelo", dueRule: { kind: "dia-fixo", day: 18 } }),
      billBase({ id: "cinza", dueRule: { kind: "dia-fixo", day: 25 } }),
      billBase({ id: "verde", dueRule: { kind: "dia-fixo", day: 10 } }),
    ]
    const pagos = [pagamento({ id: "p", billId: "verde", competencia: "2026-06" })]
    expect(contarContasEmAberto(bills, pagos, "2026-06-15", cal)).toBe(2)
  })

  it("test_ignora_conta_encerrada", () => {
    const bills = [
      billBase({ id: "viva", dueRule: { kind: "dia-fixo", day: 10 } }),
      billBase({
        id: "morta",
        estado: "encerrada",
        encerradaEm: "2026-01-01",
        dueRule: { kind: "dia-fixo", day: 10 },
      }),
    ]
    expect(contarContasEmAberto(bills, [], "2026-06-15", cal)).toBe(1)
  })
})

describe("gastoMensalMedio (Seam 1)", () => {
  it("test_soma_da_janela_dividida_pelos_doze_meses", () => {
    const bills = [billBase({ id: "bill-1" }), billBase({ id: "bill-2", nome: "Água" })]
    const pagos = [
      // mês corrente: fora da janela de 12 meses completos
      pagamento({ id: "jun", billId: "bill-1", competencia: "2026-06", valor: 10000 }),
      // maio: 14000 + 6000 = 20000
      pagamento({ id: "m1", billId: "bill-1", competencia: "2026-05", valor: 14000 }),
      pagamento({ id: "m2", billId: "bill-2", competencia: "2026-05", valor: 6000 }),
      // abril: 4000 + 6000 = 10000
      pagamento({ id: "a1", billId: "bill-1", competencia: "2026-04", valor: 4000 }),
      pagamento({ id: "a2", billId: "bill-2", competencia: "2026-04", valor: 6000 }),
      // março: 6000
      pagamento({ id: "mar", billId: "bill-2", competencia: "2026-03", valor: 6000 }),
    ]
    // (20000 + 10000 + 6000) / 12 meses = 3000 (junho fora; divisor é a janela, não os meses com gasto)
    expect(gastoMensalMedio(bills, pagos, "2026-06-15")).toBe(3000)
  })

  it("test_conta_infrequente_e_amortizada_na_janela", () => {
    // uma anual de R$1.200 num único mês entra como ~R$100/mês, não como R$1.200
    const pagos = [pagamento({ competencia: "2026-01", valor: 120000 })]
    expect(gastoMensalMedio([billBase()], pagos, "2026-06-15")).toBe(10000)
  })

  it("test_sem_historico_na_janela_e_nula", () => {
    // só o mês corrente tem pagamento; a janela de meses completos fica vazia
    const pagos = [pagamento({ competencia: "2026-06", valor: 10000 })]
    expect(gastoMensalMedio([billBase()], pagos, "2026-06-15")).toBeNull()
  })

  it("test_ignora_lancamentos_de_conta_encerrada", () => {
    const bills = [
      billBase({ id: "bill-1" }),
      billBase({ id: "bill-2", estado: "encerrada", encerradaEm: "2026-01-01" }),
    ]
    const pagos = [
      pagamento({ id: "v", billId: "bill-1", competencia: "2026-05", valor: 12000 }),
      pagamento({ id: "m", billId: "bill-2", competencia: "2026-05", valor: 99999 }),
    ]
    // 12000 / 12 = 1000 (a encerrada não entra)
    expect(gastoMensalMedio(bills, pagos, "2026-06-15")).toBe(1000)
  })
})

describe("estimarFaltaPagar (Seam 1)", () => {
  const cal = fakeCalendar()

  it("test_soma_a_media_das_contas_nao_pagas_com_historico", () => {
    const bills = [
      billBase({ id: "bill-1", nome: "Luz" }), // paga este mês → verde, não estima
      billBase({ id: "bill-2", nome: "Água" }), // não paga, com histórico → estima a média
      billBase({ id: "bill-3", nome: "Internet" }), // não paga, sem histórico → não estima
    ]
    const pagos = [
      pagamento({ id: "luz-jun", billId: "bill-1", competencia: "2026-06", valor: 10000 }),
      pagamento({ id: "agua-mai", billId: "bill-2", competencia: "2026-05", valor: 6000 }),
      pagamento({ id: "agua-abr", billId: "bill-2", competencia: "2026-04", valor: 6000 }),
      pagamento({ id: "agua-mar", billId: "bill-2", competencia: "2026-03", valor: 6000 }),
    ]
    // só Água: média 6000
    expect(estimarFaltaPagar(bills, pagos, "2026-06-15", cal)).toBe(6000)
  })

  it("test_sem_contas_em_aberto_a_estimativa_e_nula", () => {
    const pagos = [pagamento({ competencia: "2026-06" })] // paga → verde
    expect(estimarFaltaPagar([billBase()], pagos, "2026-06-15", cal)).toBeNull()
  })

  it("test_conta_em_aberto_sem_historico_nao_entra_na_estimativa", () => {
    expect(estimarFaltaPagar([billBase()], [], "2026-06-15", cal)).toBeNull()
  })

  it("test_conta_longe_do_vencimento_cinza_nao_entra_na_estimativa", () => {
    // dia-fixo 25, hoje 15/06 → vence em 10 dias → cinza (longe), mesmo com histórico
    const bill = billBase({ dueRule: { kind: "dia-fixo", day: 25 } })
    const pagos = [
      pagamento({ id: "m1", competencia: "2026-05", valor: 8000 }),
      pagamento({ id: "m2", competencia: "2026-04", valor: 8000 }),
    ]
    // cinza não é "em aberto" → fora da estimativa (coerente com contarContasEmAberto)
    expect(estimarFaltaPagar([bill], pagos, "2026-06-15", cal)).toBeNull()
  })
})

describe("derivarAgregadosFinancas (Seam 1)", () => {
  it("test_compoe_os_quatro_agregados_do_mes", () => {
    const bills = [
      billBase({ id: "bill-1", nome: "Luz" }),
      billBase({ id: "bill-2", nome: "Água" }),
      billBase({ id: "bill-3", nome: "Internet" }),
    ]
    const pagos = [
      // Luz: paga em junho (verde), histórico em maio/abril
      pagamento({ id: "luz-jun", billId: "bill-1", competencia: "2026-06", valor: 10000 }),
      pagamento({ id: "luz-mai", billId: "bill-1", competencia: "2026-05", valor: 14000 }),
      pagamento({ id: "luz-abr", billId: "bill-1", competencia: "2026-04", valor: 4000 }),
      // Água: não paga em junho (vermelho), histórico → média 6000
      pagamento({ id: "agua-mai", billId: "bill-2", competencia: "2026-05", valor: 6000 }),
      pagamento({ id: "agua-abr", billId: "bill-2", competencia: "2026-04", valor: 6000 }),
      pagamento({ id: "agua-mar", billId: "bill-2", competencia: "2026-03", valor: 6000 }),
      // Internet: nada → vermelho sem histórico
    ]
    const agg = derivarAgregadosFinancas(clock("2026-06-15"), fakeCalendar(), bills, pagos)
    expect(agg).toEqual({
      totalPagoMes: 10000, // só a Luz pagou junho
      contasEmAberto: 2, // Água + Internet (vermelho)
      gastoMensalMedio: 3000, // (20000 + 10000 + 6000) / 12 meses
      estimativaFaltaPagar: 6000, // só Água (em aberto, com histórico)
    })
  })

  it("test_ignora_contas_encerradas_em_todos_os_agregados", () => {
    const bills = [
      billBase({ id: "ativa" }),
      billBase({ id: "morta", estado: "encerrada", encerradaEm: "2026-01-01" }),
    ]
    const pagos = [
      pagamento({ id: "a", billId: "ativa", competencia: "2026-06", valor: 10000 }),
      pagamento({ id: "m", billId: "morta", competencia: "2026-06", valor: 99999 }),
    ]
    const agg = derivarAgregadosFinancas(clock("2026-06-15"), fakeCalendar(), bills, pagos)
    expect(agg.totalPagoMes).toBe(10000)
  })
})
