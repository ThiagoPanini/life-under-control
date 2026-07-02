import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import { fakeCalendar } from "./calendar.fake"
import { addMeses, type GridCelula, gridOcorrencias } from "./derive-bill-card"
import { calcularPontualidade12m, calcularPontualidadeDaConta } from "./derive-pontualidade"

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

// As 12 competências da janela do grid (2025-07 … 2026-06), da mais antiga à mais recente.
const JANELA = Array.from({ length: 12 }, (_, i) => addMeses("2026-06", i - 11))

describe("calcularPontualidade12m (Seam 1)", () => {
  it("test_sem_bills_ativas_shape_explicito", () => {
    expect(calcularPontualidade12m([], [], "2026-06-12", fakeCalendar())).toEqual({
      estado: "sem-historico",
    })
  })

  it("test_conta_encerrada_nao_conta_pontualidade", () => {
    const encerrada = billBase({ estado: "encerrada", encerradaEm: "2026-01-01" })
    const pagos = JANELA.map((c, i) =>
      pagamento({ id: `p-${i}`, competencia: c, dataPagamento: `${c}-08` }),
    )
    expect(calcularPontualidade12m([encerrada], pagos, "2026-06-12", fakeCalendar())).toEqual({
      estado: "sem-historico",
    })
  })

  it("test_percentual_no_prazo_sobre_ocorrencias_ja_vencidas", () => {
    // dia-fixo 10, hoje dia 12: até a competência corrente já venceu — as 12
    // ocorrências da janela estão todas vencidas (nenhuma "aguardando").
    const bill = billBase()
    const pagasEmDia = JANELA.slice(0, 9) // 9 primeiras: pagas 2 dias antes do vencimento
    const pagos = pagasEmDia.map((c, i) =>
      pagamento({ id: `p-${i}`, competencia: c, dataPagamento: `${c}-08` }),
    )
    // as 3 últimas (índices 9,10,11) ficam sem Lançamento — "em-aberto", não no prazo
    expect(calcularPontualidade12m([bill], pagos, "2026-06-12", fakeCalendar())).toEqual({
      estado: "calculada",
      percentual: 75, // 9/12
    })
  })

  it("test_aguardando_e_pago_sem_data_ficam_fora_do_denominador", () => {
    // dia-fixo 20, hoje dia 12: a competência corrente ainda não venceu (aguardando)
    const bill = billBase({ dueRule: { kind: "dia-fixo", day: 20 } })
    const semData = JANELA.slice(0, 5) // pagas sem data (backfill) — não dá pra julgar pontualidade
    const emDia = JANELA.slice(5, 8) // pagas no prazo
    // JANELA[8..10] ficam sem Lançamento — "em-aberto", entram no denominador
    // JANELA[11] (corrente) fica sem Lançamento — "aguardando", fora do denominador
    const pagos = [
      ...semData.map((c, i) => pagamento({ id: `sd-${i}`, competencia: c, dataPagamento: null })),
      ...emDia.map((c, i) =>
        pagamento({ id: `ed-${i}`, competencia: c, dataPagamento: `${c}-15` }),
      ),
    ]
    expect(calcularPontualidade12m([bill], pagos, "2026-06-12", fakeCalendar())).toEqual({
      estado: "calculada",
      percentual: 50, // 3 em-dia / (3 em-dia + 3 em-aberto)
    })
  })
})

function celula(over: Partial<GridCelula> = {}): GridCelula {
  return {
    competencia: "2026-06",
    vencimento: "2026-06-10",
    estado: "em-dia",
    valor: 10000,
    ...over,
  }
}

describe("calcularPontualidadeDaConta (Seam 1)", () => {
  it("test_grid_vazio_sem_historico", () => {
    expect(calcularPontualidadeDaConta([])).toEqual({ estado: "sem-historico" })
  })

  it("test_aguardando_e_pago_sem_data_fora_do_denominador", () => {
    const grid = [
      celula({ competencia: "a", estado: "em-dia" }),
      celula({ competencia: "b", estado: "atraso-leve" }),
      celula({ competencia: "c", estado: "aguardando", valor: null }),
      celula({ competencia: "d", estado: "pago-sem-data" }),
    ]
    expect(calcularPontualidadeDaConta(grid)).toEqual({ estado: "calculada", percentual: 50 })
  })

  it("test_conta_encerrada_ainda_conta_pontualidade_da_propria_conta", () => {
    // calcularPontualidade12m exclui Conta encerrada do agregado do Lar — mas o
    // grid da própria Conta (já filtrado na página de detalhe, #59) não some.
    const bill = billBase({ estado: "encerrada", encerradaEm: "2026-05-01" })
    const pagos = JANELA.slice(0, 6).map((c, i) =>
      pagamento({ id: `p-${i}`, competencia: c, dataPagamento: `${c}-08` }),
    )
    const grid = gridOcorrencias(bill, pagos, "2026-06-12", fakeCalendar())

    expect(calcularPontualidade12m([bill], pagos, "2026-06-12", fakeCalendar())).toEqual({
      estado: "sem-historico",
    })
    expect(calcularPontualidadeDaConta(grid)).toEqual({ estado: "calculada", percentual: 50 })
  })
})
