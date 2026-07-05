import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import {
  competenciaDefaultBaixa,
  derivarCardConta,
  farolDoMes,
  gridOcorrencias,
  OCORRENCIAS_NA_JANELA,
  ocorrenciasRecentes,
  resolverVencimento,
  resumoPagamentos,
} from "./derive-bill-card"

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

describe("resolverVencimento (Seam 1)", () => {
  it("test_dia_fixo_resolve_no_dia_da_competencia", () => {
    const v = resolverVencimento({ kind: "dia-fixo", day: 10 }, 0, "2026-06", fakeCalendar())
    expect(v).toBe("2026-06-10")
  })

  it("test_dia_fixo_com_offset_desloca_o_mes", () => {
    // condomínio "de janeiro" com offset +1 vence em 08/fev (caso do grilling)
    const v = resolverVencimento({ kind: "dia-fixo", day: 8 }, 1, "2026-01", fakeCalendar())
    expect(v).toBe("2026-02-08")
  })

  it("test_dia_fixo_alem_do_fim_do_mes_grampeia_no_ultimo_dia", () => {
    // dia 31 em fevereiro não existe — cai no último dia civil do mês
    const v = resolverVencimento({ kind: "dia-fixo", day: 31 }, 0, "2026-02", fakeCalendar())
    expect(v).toBe("2026-02-28")
  })

  it("test_n_esimo_dia_util_conta_so_dias_uteis", () => {
    // junho/2026 começa numa segunda; sem feriado, o 5º dia útil é 05/06
    const v = resolverVencimento({ kind: "n-esimo-dia-util", nth: 5 }, 0, "2026-06", fakeCalendar())
    expect(v).toBe("2026-06-05")
  })

  it("test_n_esimo_dia_util_pula_feriado", () => {
    // com 04/06 (Corpus Christi) feriado, o 5º dia útil escorrega para 08/06
    const cal = fakeCalendar(["2026-06-04"])
    const v = resolverVencimento({ kind: "n-esimo-dia-util", nth: 5 }, 0, "2026-06", cal)
    expect(v).toBe("2026-06-08")
  })

  it("test_ultimo_dia_util_recua_do_fim_de_semana", () => {
    // 31/05/2026 é domingo, 30 sábado — o último dia útil é sexta 29/05
    const v = resolverVencimento({ kind: "ultimo-dia-util" }, 0, "2026-05", fakeCalendar())
    expect(v).toBe("2026-05-29")
  })
})

describe("ocorrenciasRecentes (Seam 1)", () => {
  it("test_mensal_devolve_os_ultimos_n_meses_ate_a_referencia", () => {
    const comps = ocorrenciasRecentes({ intervalMonths: 1, anchorMonth: null }, "2026-03", 4)
    expect(comps).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"])
  })

  it("test_bimestral_ancorado_so_cai_nos_meses_da_ancora", () => {
    // bimestral ancorado em janeiro: jan, mar, mai… recuando a partir de abril
    const comps = ocorrenciasRecentes({ intervalMonths: 2, anchorMonth: 1 }, "2026-04", 4)
    expect(comps).toEqual(["2025-09", "2025-11", "2026-01", "2026-03"])
  })

  it("test_anual_ancorado_recua_de_ano_em_ano", () => {
    const comps = ocorrenciasRecentes({ intervalMonths: 12, anchorMonth: 1 }, "2026-06", 3)
    expect(comps).toEqual(["2024-01", "2025-01", "2026-01"])
  })
})

describe("farolDoMes (Seam 1)", () => {
  const cal = fakeCalendar()
  it("test_pago_acende_verde", () => {
    const bill = billBase()
    const pagos = [pagamento({ competencia: "2026-06" })]
    expect(farolDoMes(bill, pagos, "2026-06-20", cal)).toBe("verde")
  })
  it("test_nao_pago_e_longe_do_vencimento_fica_cinza", () => {
    expect(farolDoMes(billBase(), [], "2026-06-01", cal)).toBe("cinza")
  })
  it("test_nao_pago_a_tres_dias_ou_menos_fica_amarelo", () => {
    expect(farolDoMes(billBase(), [], "2026-06-08", cal)).toBe("amarelo")
  })
  it("test_vence_hoje_nao_pago_fica_vermelho", () => {
    expect(farolDoMes(billBase(), [], "2026-06-10", cal)).toBe("vermelho")
  })
  it("test_ja_venceu_nao_pago_fica_vermelho", () => {
    expect(farolDoMes(billBase(), [], "2026-06-15", cal)).toBe("vermelho")
  })
})

describe("gridOcorrencias (Seam 1)", () => {
  const cal = fakeCalendar()

  function celula(grid: ReturnType<typeof gridOcorrencias>, competencia: string) {
    const c = grid.find((g) => g.competencia === competencia)
    if (!c) throw new Error(`célula ${competencia} ausente`)
    return c
  }

  it("test_devolve_doze_celulas_da_mais_antiga_a_mais_recente", () => {
    const grid = gridOcorrencias(billBase(), [], "2026-06-15", cal)
    expect(grid).toHaveLength(OCORRENCIAS_NA_JANELA)
    expect(grid[0].competencia).toBe("2025-07")
    expect(grid[OCORRENCIAS_NA_JANELA - 1].competencia).toBe("2026-06")
  })

  it("test_pago_antes_do_vencimento_fica_em_dia", () => {
    // condomínio jan, offset +1 (vence 08/fev), pago 26/jan → em dia
    const bill = billBase({ dueRule: { kind: "dia-fixo", day: 8 }, dueMonthOffset: 1 })
    const pagos = [pagamento({ competencia: "2026-01", dataPagamento: "2026-01-26" })]
    const grid = gridOcorrencias(bill, pagos, "2026-02-10", cal)
    expect(celula(grid, "2026-01").estado).toBe("em-dia")
  })

  it("test_pago_ate_tres_dias_apos_o_vencimento_fica_atraso_leve", () => {
    const pagos = [pagamento({ competencia: "2026-05", dataPagamento: "2026-05-13" })]
    const grid = gridOcorrencias(billBase(), pagos, "2026-06-15", cal)
    expect(celula(grid, "2026-05").estado).toBe("atraso-leve")
  })

  it("test_pago_mais_de_tres_dias_apos_o_vencimento_fica_atraso", () => {
    const pagos = [pagamento({ competencia: "2026-05", dataPagamento: "2026-05-20" })]
    const grid = gridOcorrencias(billBase(), pagos, "2026-06-15", cal)
    expect(celula(grid, "2026-05").estado).toBe("atraso")
  })

  it("test_venceu_e_nunca_pago_fica_em_aberto", () => {
    const grid = gridOcorrencias(billBase(), [], "2026-06-15", cal)
    // maio venceu (10/05 < 15/06) e não tem pagamento → buraco
    expect(celula(grid, "2026-05").estado).toBe("em-aberto")
  })

  it("test_ainda_nao_venceu_e_nao_pago_fica_aguardando", () => {
    // offset +1: a competência de junho vence só em 10/jul, hoje 15/jun → aguardando
    const bill = billBase({ dueMonthOffset: 1 })
    const grid = gridOcorrencias(bill, [], "2026-06-15", cal)
    expect(celula(grid, "2026-06").estado).toBe("aguardando")
  })

  it("test_pago_sem_data_e_historico_neutro", () => {
    const pagos = [pagamento({ competencia: "2026-05", dataPagamento: null })]
    const grid = gridOcorrencias(billBase(), pagos, "2026-06-15", cal)
    expect(celula(grid, "2026-05").estado).toBe("pago-sem-data")
  })

  it("test_ocorrencia_anterior_a_primeira_competencia_fica_fora_da_vigencia", () => {
    // Conta que só passou a vigorar em março: fevereiro é anterior à vigência —
    // fora-vigencia, nunca em-aberto (buraco falso). Valor é lacuna (null).
    const bill = billBase({ primeiraCompetencia: "2026-03" })
    const grid = gridOcorrencias(bill, [], "2026-06-15", cal)
    expect(celula(grid, "2026-02").estado).toBe("fora-vigencia")
    expect(celula(grid, "2026-02").valor).toBeNull()
    // março (a primeira competência) já está na vigência — venceu sem pagar → em-aberto
    expect(celula(grid, "2026-03").estado).toBe("em-aberto")
  })

  it("test_grid_mantem_doze_celulas_com_fora_da_vigencia", () => {
    const bill = billBase({ primeiraCompetencia: "2026-03" })
    const grid = gridOcorrencias(bill, [], "2026-06-15", cal)
    expect(grid).toHaveLength(OCORRENCIAS_NA_JANELA)
    // as oito ocorrências anteriores a março são fora-vigencia; as quatro de março a junho não
    expect(grid.filter((c) => c.estado === "fora-vigencia")).toHaveLength(8)
  })

  it("test_recorrencia_nao_mensal_respeita_a_vigencia", () => {
    // bimestral ancorado em janeiro, vigente desde 2026-01: as ocorrências de 2025
    // e antes ficam fora-vigencia; 2026-01 (a primeira competência) já vale.
    const bill = billBase({
      recurrence: { intervalMonths: 2, anchorMonth: 1 },
      primeiraCompetencia: "2026-01",
    })
    const grid = gridOcorrencias(bill, [], "2026-06-15", cal)
    expect(celula(grid, "2025-11").estado).toBe("fora-vigencia")
    expect(celula(grid, "2026-01").estado).not.toBe("fora-vigencia")
  })

  it("test_conta_com_historico_completo_nao_tem_fora_da_vigencia", () => {
    // vigente desde 2020: nenhuma ocorrência da janela é anterior à vigência
    const grid = gridOcorrencias(billBase(), [], "2026-06-15", cal)
    expect(grid.some((c) => c.estado === "fora-vigencia")).toBe(false)
  })
})

describe("resumoPagamentos (Seam 1)", () => {
  const cal = fakeCalendar()
  it("test_media_e_sparkline_sobre_os_pagos_com_lacuna_onde_nao_pagou", () => {
    const pagos = [
      pagamento({ id: "p-a", competencia: "2026-04", valor: 10000 }),
      pagamento({ id: "p-b", competencia: "2026-06", valor: 20000 }),
    ]
    const grid = gridOcorrencias(billBase(), pagos, "2026-06-15", cal)
    const { media, sparkline } = resumoPagamentos(grid)
    expect(media).toBe(15000) // média só dos dois pagos
    expect(sparkline).toHaveLength(OCORRENCIAS_NA_JANELA)
    // o slot de maio (sem pagamento) é lacuna, não zero
    const idxMaio = grid.findIndex((g) => g.competencia === "2026-05")
    expect(sparkline[idxMaio]).toBeNull()
    const idxAbril = grid.findIndex((g) => g.competencia === "2026-04")
    expect(sparkline[idxAbril]).toBe(10000)
  })

  it("test_sem_historico_a_media_e_nula", () => {
    const grid = gridOcorrencias(billBase(), [], "2026-06-15", cal)
    const { media, sparkline } = resumoPagamentos(grid)
    expect(media).toBeNull()
    expect(sparkline.every((v) => v === null)).toBe(true)
  })
})

describe("derivarCardConta (Seam 1)", () => {
  it("test_compoe_o_card_com_clock_e_calendar_fakes", () => {
    // o caso canônico do aceite: condomínio jan, offset +1, vence 08/fev, pago 26/jan → em dia
    const bill = billBase({
      nome: "Condomínio",
      dueRule: { kind: "dia-fixo", day: 8 },
      dueMonthOffset: 1,
    })
    const pagos = [pagamento({ competencia: "2026-01", dataPagamento: "2026-01-26", valor: 90000 })]
    const card = derivarCardConta(clock("2026-02-10"), fakeCalendar(), bill, pagos)

    const jan = card.grid.find((g) => g.competencia === "2026-01")
    expect(jan?.estado).toBe("em-dia")
    expect(jan?.vencimento).toBe("2026-02-08")
    // o mês vigente (fevereiro) vence só em 08/mar, hoje 10/fev, não pago → cinza
    expect(card.farol).toBe("cinza")
    expect(card.vencimentoVigente).toBe("2026-03-08")
    expect(card.media).toBe(90000)
    expect(card.grid).toHaveLength(OCORRENCIAS_NA_JANELA)
  })
})

describe("competenciaDefaultBaixa (Seam 1, #63)", () => {
  const cal = fakeCalendar()

  /** Lançamentos em dia (dia 05, antes do vencimento dia-fixo 10) para cada competência. */
  function pagamentosEmDia(competencias: string[]): Payment[] {
    return competencias.map((competencia, i) =>
      pagamento({ id: `p-${i}`, competencia, dataPagamento: `${competencia}-05` }),
    )
  }

  it("test_competencia_default_mais_antiga_em_aberto", () => {
    // toda a janela (12 meses) em dia, exceto maio — o buraco mais antigo do
    // grid. Junho (vigente) também está em aberto (hoje já passou do dia 10),
    // mas a baixa mira maio: a mais antiga, não a mais recente.
    const bill = billBase()
    const pagas = ocorrenciasRecentes(bill.recurrence, "2026-04", 10) // 2025-07 .. 2026-04
    const competencia = competenciaDefaultBaixa(
      clock("2026-06-15"),
      cal,
      bill,
      pagamentosEmDia(pagas),
    )
    expect(competencia).toBe("2026-05")
  })

  it("test_sem_nenhuma_em_aberto_cai_na_vigente", () => {
    // toda a janela em dia até maio; junho (vigente) ainda nem venceu — sem
    // buraco, a baixa mira o mês vigente.
    const bill = billBase()
    const pagas = ocorrenciasRecentes(bill.recurrence, "2026-05", 11) // 2025-07 .. 2026-05
    const competencia = competenciaDefaultBaixa(
      clock("2026-06-05"),
      cal,
      bill,
      pagamentosEmDia(pagas),
    )
    expect(competencia).toBe("2026-06")
  })
})
