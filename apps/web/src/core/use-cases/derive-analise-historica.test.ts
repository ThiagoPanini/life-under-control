import { describe, expect, it } from "vitest"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import {
  derivarAnaliseHistorica,
  JANELA_HISTORICA_MESES,
  type SerieHistorica,
} from "./derive-analise-historica"

/** Relógio fake in-line: devolve a data civil fixa que o teste injeta. */
const clock = (hoje: string): Clock => ({ hoje: () => hoje })

/** Lançamento base — competência 2026-06, valor 100,00; cada teste muta o que precisa. */
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

/** Desembrulha os pontos, falhando o teste se a série veio vazia. */
function pontosDe(serie: SerieHistorica) {
  if (serie.estado !== "com-dados") throw new Error(`esperava com-dados, veio ${serie.estado}`)
  return serie.pontos
}

describe("derivarAnaliseHistorica (Seam 1)", () => {
  it("test_janela_de_doze_competencias_terminando_na_atual", () => {
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ competencia: "2026-06" }),
    ])
    expect(pontosDe(serie).map((ponto) => ponto.competencia)).toEqual([
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ])
    expect(JANELA_HISTORICA_MESES).toBe(12)
  })

  it("test_soma_inclui_lancamentos_de_conta_encerrada", () => {
    // Um Lançamento de Conta hoje encerrada continua sendo fato real da Competência —
    // a série soma por Competência sem filtrar por estado da Conta.
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ id: "ativa", billId: "bill-ativa", competencia: "2026-04", valor: 4000 }),
      pagamento({ id: "encerrada", billId: "bill-encerrada", competencia: "2026-04", valor: 5000 }),
    ])
    expect(pontosDe(serie).find((ponto) => ponto.competencia === "2026-04")).toEqual({
      competencia: "2026-04",
      valor: 9000,
      estado: "fechado",
    })
  })

  it("test_soma_agrega_splits_da_mesma_competencia", () => {
    // Baixa partida: dois Lançamentos na mesma Conta+Competência somam.
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ id: "parte-1", competencia: "2026-03", valor: 3000 }),
      pagamento({ id: "parte-2", competencia: "2026-03", valor: 2500 }),
    ])
    expect(pontosDe(serie).find((ponto) => ponto.competencia === "2026-03")).toEqual({
      competencia: "2026-03",
      valor: 5500,
      estado: "fechado",
    })
  })

  it("test_mes_corrente_marcado_em_curso_mesmo_com_valor", () => {
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ competencia: "2026-06", valor: 7000 }),
    ])
    expect(pontosDe(serie).find((ponto) => ponto.competencia === "2026-06")).toEqual({
      competencia: "2026-06",
      valor: 7000,
      estado: "em-curso",
    })
  })

  it("test_serie_viva_havendo_fatos_na_janela", () => {
    // Sem qualquer noção de Conta ativa: basta haver fato na janela para a série existir.
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ competencia: "2026-02", valor: 1200 }),
    ])
    expect(serie.estado).toBe("com-dados")
  })

  it("test_mes_sem_fato_nao_vira_zero_silencioso", () => {
    // 2026-05 não tem Lançamento — é "sem-dado", não um gasto zero disfarçado.
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ competencia: "2026-04", valor: 4000 }),
    ])
    expect(pontosDe(serie).find((ponto) => ponto.competencia === "2026-05")).toEqual({
      competencia: "2026-05",
      valor: 0,
      estado: "sem-dado",
    })
  })

  it("test_historico_insuficiente_mantem_janela_com_sem_dado_explicito", () => {
    // Só um fato recente: os meses anteriores viram "sem-dado" (histórico curto, honesto),
    // e a série continua com-dados — não some a seção inteira.
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ competencia: "2026-06", valor: 9000 }),
    ])
    const pontos = pontosDe(serie)
    expect(pontos).toHaveLength(12)
    expect(pontos.filter((ponto) => ponto.estado === "sem-dado")).toHaveLength(11)
    expect(pontos.at(-1)).toEqual({ competencia: "2026-06", valor: 9000, estado: "em-curso" })
  })

  it("test_sem_nenhum_fato_na_janela_vira_sem_fatos", () => {
    expect(derivarAnaliseHistorica(clock("2026-06-15"), [])).toEqual({ estado: "sem-fatos" })
  })

  it("test_fatos_fora_da_janela_sao_ignorados", () => {
    // Único Lançamento é anterior à janela de 12 meses → série sem fatos.
    const serie = derivarAnaliseHistorica(clock("2026-06-15"), [
      pagamento({ competencia: "2024-01", valor: 9999 }),
    ])
    expect(serie).toEqual({ estado: "sem-fatos" })
  })
})
