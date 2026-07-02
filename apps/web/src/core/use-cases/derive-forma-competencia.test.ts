import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { addMeses } from "./derive-bill-card"
import {
  contarQuitadas,
  derivarFormaCompetencia,
  derivarMarcadoresDaPista,
  estimarFaltaPagarDoMes,
  listarPendenciasAnteriores,
  projetarGastoDaCompetencia,
  somarPagoDaCompetencia,
} from "./derive-forma-competencia"

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

describe("projetarGastoDaCompetencia (Seam 1)", () => {
  it("test_projetado_soma_medias_das_contas_do_mes", () => {
    const bills = [billBase({ id: "luz" }), billBase({ id: "agua", nome: "Água" })]
    const pagos = [
      pagamento({ id: "luz-mai", billId: "luz", competencia: "2026-05", valor: 10000 }),
      pagamento({ id: "luz-abr", billId: "luz", competencia: "2026-04", valor: 12000 }),
      pagamento({ id: "agua-mai", billId: "agua", competencia: "2026-05", valor: 4000 }),
      pagamento({ id: "agua-abr", billId: "agua", competencia: "2026-04", valor: 6000 }),
    ]
    // luz: média(10000,12000) = 11000 · água: média(4000,6000) = 5000 · soma = 16000
    expect(projetarGastoDaCompetencia(bills, pagos, "2026-06")).toEqual({
      estado: "estimado",
      valor: 16000,
    })
  })

  it("test_media_ignora_ausencias_nao_zera", () => {
    const pagos = [
      pagamento({ id: "a", competencia: "2026-03", valor: 9000 }),
      pagamento({ id: "b", competencia: "2026-01", valor: 9000 }),
      // os outros 10 meses da janela ficam sem Lançamento — lacuna, não zero
    ]
    // média(9000,9000) = 9000, não (9000+9000)/12
    expect(projetarGastoDaCompetencia([billBase()], pagos, "2026-06")).toEqual({
      estado: "estimado",
      valor: 9000,
    })
  })

  it("test_media_soma_baixas_partidas_da_mesma_competencia", () => {
    // março foi pago em duas baixas (partida) — a média deve somar as duas, não pegar só a primeira
    const pagos = [
      pagamento({ id: "a", competencia: "2026-03", valor: 6000 }),
      pagamento({ id: "b", competencia: "2026-03", valor: 4000 }),
    ]
    // um único mês na janela: soma 10000 → média 10000
    expect(projetarGastoDaCompetencia([billBase()], pagos, "2026-06")).toEqual({
      estado: "estimado",
      valor: 10000,
    })
  })

  it("test_sem_historico_shape_explicito", () => {
    // Conta com ocorrência em junho, nenhum Lançamento em lugar nenhum
    expect(projetarGastoDaCompetencia([billBase()], [], "2026-06")).toEqual({
      estado: "sem-historico",
    })
  })

  it("test_recorrencia_anual_fora_do_mes_nao_entra", () => {
    // IPTU anual ancorado em janeiro: junho não é mês de ocorrência
    const iptu = billBase({
      id: "iptu",
      nome: "IPTU",
      recurrence: { intervalMonths: 12, anchorMonth: 1 },
    })
    const pagos = [pagamento({ id: "p", billId: "iptu", competencia: "2025-01", valor: 120000 })]
    // nenhuma Conta tem ocorrência em junho → sem-historico, não a média do IPTU
    expect(projetarGastoDaCompetencia([iptu], pagos, "2026-06")).toEqual({
      estado: "sem-historico",
    })
  })
})

describe("somarPagoDaCompetencia (Seam 1)", () => {
  it("test_soma_baixas_partidas_da_mesma_competencia", () => {
    const pagos = [
      pagamento({ id: "a", competencia: "2026-06", valor: 6000 }),
      pagamento({ id: "b", competencia: "2026-06", valor: 4000 }),
    ]
    expect(somarPagoDaCompetencia([billBase()], pagos, "2026-06")).toBe(10000)
  })

  it("test_ignora_lancamento_fora_de_fase_da_recorrencia", () => {
    // bimestral ancorada em janeiro: junho não é mês de ocorrência — um Lançamento
    // ali é fora de fase e não deve inflar o pago de uma competência que nem é dela
    const bimestralFora = billBase({
      id: "bimestral-fora",
      recurrence: { intervalMonths: 2, anchorMonth: 1 },
    })
    const pagos = [
      pagamento({ id: "p", billId: "bimestral-fora", competencia: "2026-06", valor: 99999 }),
    ]
    expect(somarPagoDaCompetencia([bimestralFora], pagos, "2026-06")).toBe(0)
  })
})

describe("estimarFaltaPagarDoMes (Seam 1)", () => {
  it("test_falta_pagar_nunca_negativo", () => {
    const projetado = { estado: "estimado" as const, valor: 5000 }
    // pago (20000) supera o projetado (5000) — a diferença nunca fica negativa
    expect(estimarFaltaPagarDoMes(projetado, 20000)).toEqual({ estado: "estimado", valor: 0 })
  })

  it("test_falta_pagar_e_a_diferenca_quando_positiva", () => {
    const projetado = { estado: "estimado" as const, valor: 16000 }
    expect(estimarFaltaPagarDoMes(projetado, 10000)).toEqual({ estado: "estimado", valor: 6000 })
  })

  it("test_sem_historico_nao_estima_falta_pagar", () => {
    expect(estimarFaltaPagarDoMes({ estado: "sem-historico" }, 5000)).toEqual({
      estado: "sem-historico",
    })
  })
})

describe("contarQuitadas (Seam 1)", () => {
  it("test_quitadas_denominador_so_ocorrencias_do_mes", () => {
    const bills = [
      billBase({ id: "ativa1", nome: "Ativa quitada" }),
      billBase({ id: "ativa2", nome: "Ativa em aberto" }),
      billBase({
        id: "bimestral-fora",
        nome: "Bimestral fora de fase",
        recurrence: { intervalMonths: 2, anchorMonth: 1 },
      }),
      billBase({
        id: "encerrada",
        nome: "Encerrada",
        estado: "encerrada",
        encerradaEm: "2026-01-01",
      }),
    ]
    const pagos = [pagamento({ id: "p", billId: "ativa1", competencia: "2026-06", valor: 10000 })]
    // M = só ativa1 + ativa2 (bimestral fora de fase e encerrada não contam) · N = só ativa1
    expect(contarQuitadas(bills, pagos, "2026-06")).toEqual({ quitadas: 1, total: 2 })
  })
})

describe("derivarMarcadoresDaPista (Seam 1)", () => {
  it("test_marcadores_da_pista_por_dia_e_estado", () => {
    const bills = [
      billBase({ id: "luz", nome: "Luz", dueRule: { kind: "dia-fixo", day: 10 } }), // venceu há 2 dias, não paga
      billBase({ id: "netflix", nome: "Netflix", dueRule: { kind: "dia-fixo", day: 14 } }), // vence em 2 dias, não paga
      billBase({ id: "agua", nome: "Água", dueRule: { kind: "dia-fixo", day: 25 } }), // vence em 13 dias, não paga
      billBase({ id: "internet", nome: "Internet", dueRule: { kind: "dia-fixo", day: 5 } }), // paga
    ]
    const pagos = [
      pagamento({ id: "luz-mai", billId: "luz", competencia: "2026-05", valor: 9000 }),
      pagamento({ id: "luz-abr", billId: "luz", competencia: "2026-04", valor: 9000 }),
      pagamento({ id: "netflix-mai", billId: "netflix", competencia: "2026-05", valor: 3000 }),
      pagamento({
        id: "internet-jun",
        billId: "internet",
        competencia: "2026-06",
        valor: 8000,
      }),
    ]
    const marcadores = derivarMarcadoresDaPista(
      clock("2026-06-12"),
      fakeCalendar(),
      bills,
      pagos,
      "2026-06",
    )

    function marcador(contaId: string) {
      const m = marcadores.find((mk) => mk.contaId === contaId)
      if (!m) throw new Error(`marcador ${contaId} ausente`)
      return m
    }

    expect(marcador("luz")).toMatchObject({
      dia: "2026-06-10",
      estado: "a-vencer",
      valorEsperado: 9000,
    })
    expect(marcador("netflix")).toMatchObject({
      dia: "2026-06-14",
      estado: "a-vencer",
      valorEsperado: 3000,
    })
    expect(marcador("agua")).toMatchObject({
      dia: "2026-06-25",
      estado: "aguardando",
      valorEsperado: null, // sem histórico — nunca inventa estimativa
    })
    expect(marcador("internet")).toMatchObject({
      dia: "2026-06-05",
      competencia: "2026-06",
      estado: "quitada",
      valorEsperado: 8000, // valor real da quitação, não a média
    })
  })

  it("test_marcador_quitada_soma_baixas_partidas", () => {
    // conta paga em duas baixas na mesma competência — o marcador soma as duas
    const bills = [billBase({ id: "luz" })]
    const pagos = [
      pagamento({ id: "a", billId: "luz", competencia: "2026-06", valor: 6000 }),
      pagamento({ id: "b", billId: "luz", competencia: "2026-06", valor: 4000 }),
    ]
    const marcadores = derivarMarcadoresDaPista(
      clock("2026-06-12"),
      fakeCalendar(),
      bills,
      pagos,
      "2026-06",
    )
    expect(marcadores[0]).toMatchObject({ estado: "quitada", valorEsperado: 10000 })
  })
})

describe("listarPendenciasAnteriores (Seam 1)", () => {
  it("test_pendencias_anteriores_sao_colecao", () => {
    const bill = billBase({ id: "luz" })
    const mesAnterior = addMeses("2026-06", -1)
    // as 12 competências da janela que termina no mês anterior à competência alvo
    const janela = Array.from({ length: 12 }, (_, i) => addMeses(mesAnterior, i - 11))
    const semPagamento = new Set(["2026-02", "2026-04"])
    const pagos = janela
      .filter((c) => !semPagamento.has(c))
      .map((c, i) => pagamento({ id: `p-${i}`, billId: "luz", competencia: c, valor: 9000 }))

    const pendencias = listarPendenciasAnteriores(fakeCalendar(), [bill], pagos, "2026-06")

    // coleção, nunca campo singular — nenhuma pendência se perde
    expect(pendencias.map((p) => p.competencia).sort()).toEqual(["2026-02", "2026-04"])
    expect(pendencias.every((p) => p.contaId === "luz")).toBe(true)
  })
})

describe("derivarFormaCompetencia (Seam 1)", () => {
  it("test_compoe_a_forma_da_competencia", () => {
    const bills = [billBase({ id: "luz", nome: "Luz" })]
    // histórico completo dos 12 meses anteriores (sem lacuna) — não gera pendência anterior
    const janela = Array.from({ length: 12 }, (_, i) => addMeses("2026-05", i - 11))
    const pagos = [
      ...janela.map((c, i) =>
        pagamento({ id: `hist-${i}`, billId: "luz", competencia: c, valor: 9000 }),
      ),
      pagamento({ id: "luz-jun", billId: "luz", competencia: "2026-06", valor: 9500 }),
    ]
    const forma = derivarFormaCompetencia(
      clock("2026-06-12"),
      fakeCalendar(),
      bills,
      pagos,
      "2026-06",
    )
    expect(forma.projetado).toEqual({ estado: "estimado", valor: 9000 })
    expect(forma.pago).toBe(9500)
    expect(forma.faltaPagar).toEqual({ estado: "estimado", valor: 0 })
    expect(forma.quitadas).toEqual({ quitadas: 1, total: 1 })
    expect(forma.marcadores).toHaveLength(1)
    expect(forma.pendenciasAnteriores).toEqual([])
  })
})
