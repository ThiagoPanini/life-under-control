import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { derivarPanoramaMensal } from "./derive-panorama-mensal"

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

describe("derivarPanoramaMensal — valores (Seam 1)", () => {
  it("test_split_payments_somados_no_pago", () => {
    // Duas baixas fracionadas da mesma Conta+Competência somam no card pago.
    const [card] = derivarPanoramaMensal(
      clock("2026-07-15"),
      fakeCalendar(),
      [billBase()],
      [
        pagamento({ id: "p-a", competencia: "2026-07", valor: 3000, dataPagamento: "2026-07-05" }),
        pagamento({ id: "p-b", competencia: "2026-07", valor: 2000, dataPagamento: "2026-07-06" }),
      ],
    )
    expect(card.estado).toBe("pago")
    expect(card.valor).toEqual({ estado: "pago", total: 5000 })
  })

  it("test_pago_prevalece_mesmo_vencido", () => {
    // Vencimento (dia 10) já passou, mas há Lançamento na Competência: pago prevalece.
    const [card] = derivarPanoramaMensal(
      clock("2026-07-20"),
      fakeCalendar(),
      [billBase()],
      [pagamento({ competencia: "2026-07", valor: 4000, dataPagamento: "2026-07-18" })],
    )
    expect(card.estado).toBe("pago")
  })

  it("test_estimativa_media_quando_em_aberto_com_historico", () => {
    // Em aberto (dia 10, hoje dia 5 → faltam 5) com histórico: estimativa pela média 12 anteriores.
    const [card] = derivarPanoramaMensal(
      clock("2026-07-05"),
      fakeCalendar(),
      [billBase()],
      [
        pagamento({ id: "p-05", competencia: "2026-05", valor: 6000, dataPagamento: "2026-05-08" }),
        pagamento({ id: "p-06", competencia: "2026-06", valor: 4000, dataPagamento: "2026-06-08" }),
      ],
    )
    expect(card.valor).toEqual({ estado: "estimativa", media: 5000 })
  })

  it("test_estimativa_soma_split_do_historico", () => {
    // A média histórica também agrega baixas fracionadas por Competência.
    const [card] = derivarPanoramaMensal(
      clock("2026-07-05"),
      fakeCalendar(),
      [billBase()],
      [
        pagamento({
          id: "p-06a",
          competencia: "2026-06",
          valor: 3000,
          dataPagamento: "2026-06-08",
        }),
        pagamento({
          id: "p-06b",
          competencia: "2026-06",
          valor: 1000,
          dataPagamento: "2026-06-09",
        }),
      ],
    )
    // única Competência com histórico (06) soma 4000 → média = 4000.
    expect(card.valor).toEqual({ estado: "estimativa", media: 4000 })
  })

  it("test_ausencia_explicita_sem_historico_nunca_zero", () => {
    // Sem base válida: ausência explícita, jamais R$ 0,00 inventado.
    const [card] = derivarPanoramaMensal(clock("2026-07-05"), fakeCalendar(), [billBase()], [])
    expect(card.valor).toEqual({ estado: "ausente" })
  })

  it("test_autoria_do_ultimo_pagador_e_null_em_aberto", () => {
    const [quitada] = derivarPanoramaMensal(
      clock("2026-07-15"),
      fakeCalendar(),
      [billBase()],
      [
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
      ],
    )
    expect(quitada.autoria).toBe("jakeline")

    const [emAberto] = derivarPanoramaMensal(clock("2026-07-05"), fakeCalendar(), [billBase()], [])
    expect(emAberto.autoria).toBeNull()
  })
})

describe("derivarPanoramaMensal — estados (Seam 1)", () => {
  it("test_a_vencer_cinco_dias_ou_mais", () => {
    // hoje dia 5, vencimento dia 10 → faltam 5 dias.
    const [card] = derivarPanoramaMensal(clock("2026-07-05"), fakeCalendar(), [billBase()], [])
    expect(card.estado).toBe("a-vencer")
  })

  it("test_vence_em_breve_entre_hoje_e_quatro_dias", () => {
    // hoje dia 6, vencimento dia 10 → faltam 4 dias.
    const [card] = derivarPanoramaMensal(clock("2026-07-06"), fakeCalendar(), [billBase()], [])
    expect(card.estado).toBe("vence-em-breve")
  })

  it("test_limite_quatro_para_cinco", () => {
    const dia10 = billBase({ dueRule: { kind: "dia-fixo", day: 10 } })
    const [quatro] = derivarPanoramaMensal(clock("2026-07-06"), fakeCalendar(), [dia10], [])
    const [cinco] = derivarPanoramaMensal(clock("2026-07-05"), fakeCalendar(), [dia10], [])
    expect(quatro.estado).toBe("vence-em-breve")
    expect(cinco.estado).toBe("a-vencer")
  })

  it("test_vence_hoje_e_vence_em_breve_nao_vencida", () => {
    // hoje == vencimento (dia 10): vence hoje NÃO é atraso consumado.
    const [card] = derivarPanoramaMensal(clock("2026-07-10"), fakeCalendar(), [billBase()], [])
    expect(card.estado).toBe("vence-em-breve")
  })

  it("test_vencida_somente_depois_do_vencimento", () => {
    // hoje dia 11, vencimento dia 10 → venceu ontem.
    const [card] = derivarPanoramaMensal(clock("2026-07-11"), fakeCalendar(), [billBase()], [])
    expect(card.estado).toBe("vencida")
  })
})

describe("derivarPanoramaMensal — frase (Seam 1)", () => {
  it("test_frase_vence_amanha_quando_falta_um_dia", () => {
    // hoje dia 9, vencimento dia 10 → "vence amanhã" (protótipo Final), não "vence em 1 dia".
    const [card] = derivarPanoramaMensal(clock("2026-07-09"), fakeCalendar(), [billBase()], [])
    expect(card.frase).toBe("vence amanhã")
  })

  it("test_frase_a_vencer_tambem_diz_vence_em", () => {
    // hoje dia 5, vencimento dia 20 → a-vencer usa a MESMA frase "vence em N dias"
    // do protótipo (nenhum estado aberto diz só "em N dias").
    const [card] = derivarPanoramaMensal(
      clock("2026-07-05"),
      fakeCalendar(),
      [billBase({ dueRule: { kind: "dia-fixo", day: 20 } })],
      [],
    )
    expect(card.estado).toBe("a-vencer")
    expect(card.frase).toBe("vence em 15 dias")
  })
})

describe("derivarPanoramaMensal — escopo e ordem (Seam 1)", () => {
  it("test_apenas_contas_com_ocorrencia_vigente", () => {
    // Conta anual (âncora janeiro) não tem ocorrência em julho → fora do panorama.
    const mensal = billBase({ id: "mensal" })
    const anual = billBase({
      id: "anual",
      recurrence: { intervalMonths: 12, anchorMonth: 1 },
    })
    const cards = derivarPanoramaMensal(clock("2026-07-15"), fakeCalendar(), [mensal, anual], [])
    expect(cards.map((c) => c.billId)).toEqual(["mensal"])
  })

  it("test_conta_encerrada_fora_do_panorama", () => {
    const encerrada = billBase({ id: "enc", estado: "encerrada", encerradaEm: "2026-06-30" })
    const cards = derivarPanoramaMensal(clock("2026-07-15"), fakeCalendar(), [encerrada], [])
    expect(cards).toHaveLength(0)
  })

  it("test_ordenacao_vencida_primeiro_pago_por_ultimo", () => {
    const vencida = billBase({ id: "b-vencida", dueRule: { kind: "dia-fixo", day: 3 } })
    const breve = billBase({ id: "b-breve", dueRule: { kind: "dia-fixo", day: 12 } })
    const aVencer = billBase({ id: "b-avencer", dueRule: { kind: "dia-fixo", day: 20 } })
    const pago = billBase({ id: "b-pago", dueRule: { kind: "dia-fixo", day: 5 } })

    const cards = derivarPanoramaMensal(
      clock("2026-07-10"),
      fakeCalendar(),
      [aVencer, pago, breve, vencida],
      [pagamento({ billId: "b-pago", competencia: "2026-07", valor: 1000 })],
    )

    expect(cards.map((c) => c.billId)).toEqual(["b-vencida", "b-breve", "b-avencer", "b-pago"])
  })
})
