import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { OCORRENCIAS_NA_JANELA } from "./derive-bill-card"
import { derivarPanoramaMensal } from "./derive-panorama-mensal"
import { derivarVisaoAnaliticaContas } from "./derive-visao-analitica"

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

function linha(linhas: ReturnType<typeof derivarVisaoAnaliticaContas>, billId: string) {
  const l = linhas.find((x) => x.billId === billId)
  if (!l) throw new Error(`linha ${billId} ausente`)
  return l
}

describe("derivarVisaoAnaliticaContas (Seam 1)", () => {
  const cal = fakeCalendar()

  it("test_sem_conta_devolve_vazio", () => {
    expect(derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [], [])).toEqual([])
  })

  it("test_uma_linha_por_conta_ativa_ordenada_por_urgencia", () => {
    const vencida = billBase({ id: "b-vencida", dueRule: { kind: "dia-fixo", day: 5 } })
    const emBreve = billBase({ id: "b-breve", dueRule: { kind: "dia-fixo", day: 12 } })
    const aVencer = billBase({ id: "b-avencer", dueRule: { kind: "dia-fixo", day: 25 } })

    const linhas = derivarVisaoAnaliticaContas(
      clock("2026-07-10"),
      cal,
      [aVencer, emBreve, vencida],
      [],
    )
    expect(linhas.map((l) => l.billId)).toEqual(["b-vencida", "b-breve", "b-avencer"])
  })

  it("test_estado_da_linha_igual_ao_panorama", () => {
    const bills = [
      billBase({ id: "b-a", dueRule: { kind: "dia-fixo", day: 5 } }),
      billBase({ id: "b-b", dueRule: { kind: "dia-fixo", day: 25 } }),
    ]
    const pagos = [pagamento({ billId: "b-a", competencia: "2026-07", valor: 3000 })]
    const linhas = derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, bills, pagos)
    const cards = derivarPanoramaMensal(clock("2026-07-10"), cal, bills, pagos)
    for (const card of cards) {
      expect(linha(linhas, card.billId).estado).toBe(card.estado)
    }
  })

  it("test_conta_nao_mensal_reflete_ocorrencia_vigente", () => {
    // bimestral ancorado em janeiro: em julho NÃO há ocorrência (jan/mar/mai/jul... jul sim).
    // Uso anual pra garantir mês fora de ocorrência: âncora janeiro, hoje julho.
    const anual = billBase({ id: "b-anual", recurrence: { intervalMonths: 12, anchorMonth: 1 } })
    const linhas = derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [anual], [])
    // a ocorrência vigente é janeiro/2026 (a mais recente até hoje), não julho.
    expect(linha(linhas, "b-anual").competenciaVigente).toBe("2026-01")
  })

  it("test_valor_real_quando_ocorrencia_vigente_paga", () => {
    const pagos = [pagamento({ competencia: "2026-07", valor: 5000, dataPagamento: "2026-07-10" })]
    const linhas = derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [billBase()], pagos)
    expect(linha(linhas, "bill-1").valor).toEqual({ estado: "pago", total: 5000 })
    expect(linha(linhas, "bill-1").autoria).toBe("p-1")
  })

  it("test_desvio_do_valor_pago_usa_mesma_regra_do_mapa_do_ano", () => {
    const pagos = [
      pagamento({ id: "p-06", competencia: "2026-06", valor: 7000 }),
      pagamento({ id: "p-07", competencia: "2026-07", valor: 13000, dataPagamento: "2026-07-10" }),
    ]
    const l = linha(
      derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [billBase()], pagos),
      "bill-1",
    )

    expect(l.media).toBe(10000)
    expect(l.desvioValor).toEqual({ centavos: 3000, estado: "acima" })
  })

  it("test_valor_estimativa_media_quando_em_aberto", () => {
    // dia 10, hoje 10: a ocorrência vigente (07) venceu hoje sem Lançamento — em aberto.
    const pagos = [
      pagamento({ id: "p-05", competencia: "2026-05", valor: 6000, dataPagamento: "2026-05-08" }),
      pagamento({ id: "p-06", competencia: "2026-06", valor: 4000, dataPagamento: "2026-06-08" }),
    ]
    const linhas = derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [billBase()], pagos)
    expect(linha(linhas, "bill-1").valor).toEqual({ estado: "estimativa", media: 5000 })
  })

  it("test_sinaleiro_e_sparkline_mesma_janela_de_doze_concordam_celula_a_celula", () => {
    const pagos = [
      pagamento({ id: "p-04", competencia: "2026-04", valor: 10000 }),
      pagamento({ id: "p-06", competencia: "2026-06", valor: 20000 }),
    ]
    const l = linha(
      derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [billBase()], pagos),
      "bill-1",
    )
    expect(l.grid).toHaveLength(OCORRENCIAS_NA_JANELA)
    expect(l.sparkline).toHaveLength(OCORRENCIAS_NA_JANELA)
    // a sparkline é o valor de cada célula do sinaleiro, célula a célula.
    expect(l.sparkline).toEqual(l.grid.map((c) => c.valor))
    expect(l.media).toBe(15000)
  })

  it("test_pontualidade_detalhada_com_n_de_m_no_prazo", () => {
    const pagos = [
      pagamento({ id: "p-05", competencia: "2026-05", valor: 5000, dataPagamento: "2026-05-08" }),
    ]
    const l = linha(
      derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [billBase()], pagos),
      "bill-1",
    )
    expect(l.pontualidade.estado).toBe("calculada")
    if (l.pontualidade.estado === "calculada") {
      expect(l.pontualidade.frase).toMatch(/\d+\/\d+ no prazo/)
    }
  })

  it("test_frase_de_urgencia_da_ocorrencia_vigente", () => {
    // pago hoje → "pago em 10/07"; a frase é a mesma fonte do Panorama.
    const pagos = [pagamento({ competencia: "2026-07", valor: 5000, dataPagamento: "2026-07-10" })]
    const paga = linha(
      derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [billBase()], pagos),
      "bill-1",
    )
    expect(paga.frase).toBe("pago em 10/07")
    // em aberto, dia 10 hoje dia 3 → "vence em 7 dias"
    const aberta = linha(
      derivarVisaoAnaliticaContas(clock("2026-07-03"), cal, [billBase()], []),
      "bill-1",
    )
    expect(aberta.frase).toBe("vence em 7 dias")
  })

  it("test_valor_ausente_sem_historico_nao_inventa_numero", () => {
    // Conta nova (vigente desde julho), sem nenhum Lançamento: em aberto sem base —
    // valor é ausência explícita, nunca R$ 0,00 (CONTEXT.md #4/#5).
    const nova = billBase({ id: "b-nova", primeiraCompetencia: "2026-07" })
    const l = linha(derivarVisaoAnaliticaContas(clock("2026-07-15"), cal, [nova], []), "b-nova")
    expect(l.valor).toEqual({ estado: "ausente" })
    expect(l.media).toBeNull()
  })

  it("test_conta_nao_mensal_aparece_junto_das_mensais", () => {
    // a anual (fora de fase em julho) não some — entra ao lado da mensal.
    const mensal = billBase({ id: "b-mensal" })
    const anual = billBase({ id: "b-anual", recurrence: { intervalMonths: 12, anchorMonth: 1 } })
    const linhas = derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [mensal, anual], [])
    expect(new Set(linhas.map((l) => l.billId))).toEqual(new Set(["b-mensal", "b-anual"]))
  })

  it("test_autoria_e_de_quem_deu_a_ultima_baixa_da_vigente", () => {
    // baixa partida na vigente: a autoria é a da baixa mais recente por data.
    const pagos = [
      pagamento({
        id: "p-a",
        competencia: "2026-07",
        valor: 3000,
        dataPagamento: "2026-07-05",
        paidBy: "thiago",
      }),
      pagamento({
        id: "p-b",
        competencia: "2026-07",
        valor: 2000,
        dataPagamento: "2026-07-08",
        paidBy: "jakeline",
      }),
    ]
    const l = linha(
      derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [billBase()], pagos),
      "bill-1",
    )
    expect(l.valor).toEqual({ estado: "pago", total: 5000 })
    expect(l.autoria).toBe("jakeline")
  })

  it("test_conta_jovem_tem_fora_vigencia_no_sinaleiro", () => {
    const jovem = billBase({ id: "b-jovem", primeiraCompetencia: "2026-05" })
    const l = linha(derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [jovem], []), "b-jovem")
    expect(l.grid.some((c) => c.estado === "fora-vigencia")).toBe(true)
  })

  it("test_encerradas_fora_por_padrao", () => {
    const ativa = billBase({ id: "b-ativa" })
    const encerrada = billBase({
      id: "b-encerrada",
      estado: "encerrada",
      encerradaEm: "2026-03-15",
    })
    const linhas = derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [ativa, encerrada], [])
    expect(linhas.map((l) => l.billId)).toEqual(["b-ativa"])
  })

  it("test_encerradas_ao_fim_atenuadas_quando_incluidas", () => {
    const ativa = billBase({ id: "b-ativa", dueRule: { kind: "dia-fixo", day: 5 } })
    const enc1 = billBase({ id: "b-enc1", estado: "encerrada", encerradaEm: "2026-01-10" })
    const enc2 = billBase({ id: "b-enc2", estado: "encerrada", encerradaEm: "2026-03-10" })
    const linhas = derivarVisaoAnaliticaContas(clock("2026-07-10"), cal, [enc1, ativa, enc2], [], {
      incluirEncerradas: true,
    })
    // ativa primeiro; encerradas ao fim, mais recente encerramento na frente.
    expect(linhas.map((l) => l.billId)).toEqual(["b-ativa", "b-enc2", "b-enc1"])
    expect(linha(linhas, "b-enc2").encerrada).toBe(true)
    expect(linha(linhas, "b-ativa").encerrada).toBe(false)
  })
})
