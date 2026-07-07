import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { ReciboWhatsapp } from "@/core/domain/recibo-whatsapp"
import { fakeCalendar } from "./calendar.fake"
import { casarReciboConta } from "./casar-recibo-conta"

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

function reciboBase(over: Partial<ReciboWhatsapp> = {}): ReciboWhatsapp {
  return {
    valorCentavos: null,
    dataPagamento: null,
    favorecido: null,
    vencimentoImpresso: null,
    mesReferenciaImpresso: null,
    ...over,
  }
}

describe("casarReciboConta (WhatsApp fase 1, #162)", () => {
  const cal = fakeCalendar()

  it("test_favorecido_claro_ranqueia_a_conta_certa_em_primeiro", () => {
    const enel = billBase({ id: "bill-enel", nome: "Enel", dueRule: { kind: "dia-fixo", day: 10 } })
    const internet = billBase({
      id: "bill-internet",
      nome: "Internet",
      dueRule: { kind: "dia-fixo", day: 20 },
    })
    const recibo = reciboBase({ favorecido: "Enel Distribuicao SP", dataPagamento: "2026-06-10" })

    const ranking = casarReciboConta(
      recibo,
      [
        { bill: internet, payments: [] },
        { bill: enel, payments: [] },
      ],
      cal,
    )

    expect(ranking[0].bill.id).toBe("bill-enel")
    expect(ranking[0].score).toBeCloseTo(0.7)
    expect(ranking[1].score).toBe(0)
  })

  it("test_favorecido_ambiguo_desempata_pela_proximidade_do_vencimento", () => {
    const blocoA = billBase({
      id: "bill-condominio-a",
      nome: "Condomínio Bloco A",
      dueRule: { kind: "dia-fixo", day: 5 },
    })
    const blocoB = billBase({
      id: "bill-condominio-b",
      nome: "Condomínio Bloco B",
      dueRule: { kind: "dia-fixo", day: 25 },
    })
    // favorece igualmente os dois nomes ("Condominio" está contido em ambos) —
    // só a proximidade do vencimento projetado desempata.
    const recibo = reciboBase({ favorecido: "Condominio", dataPagamento: "2026-06-04" })

    const ranking = casarReciboConta(
      recibo,
      [
        { bill: blocoA, payments: [] },
        { bill: blocoB, payments: [] },
      ],
      cal,
    )

    expect(ranking[0].bill.id).toBe("bill-condominio-a")
    expect(ranking[0].score).toBeGreaterThan(ranking[1].score)
  })

  it("test_baixa_fracionada_nao_elimina_a_conta_ja_com_lancamento_na_competencia", () => {
    const agua = billBase({ id: "bill-agua", nome: "Água", dueRule: { kind: "dia-fixo", day: 15 } })
    const outra = billBase({
      id: "bill-outra",
      nome: "Gás",
      dueRule: { kind: "dia-fixo", day: 15 },
    })
    const recibo = reciboBase({ favorecido: "Agua", dataPagamento: "2026-06-15" })
    const jaLancado = [pagamento({ billId: "bill-agua", competencia: "2026-06", valor: 4000 })]

    const ranking = casarReciboConta(
      recibo,
      [
        { bill: outra, payments: [] },
        { bill: agua, payments: jaLancado },
      ],
      cal,
    )

    // sinal suave (0.9), nunca zera: a Conta com baixa fracionada continua no topo
    expect(ranking[0].bill.id).toBe("bill-agua")
    expect(ranking[0].score).toBeCloseTo(0.9)
  })

  it("test_empate_entre_candidatas_preserva_a_ordem_de_entrada", () => {
    const x = billBase({ id: "bill-x", nome: "Streaming" })
    const y = billBase({ id: "bill-y", nome: "Streaming" })
    const recibo = reciboBase({ favorecido: "Streaming", dataPagamento: "2026-06-10" })

    const ranking = casarReciboConta(
      recibo,
      [
        { bill: x, payments: [] },
        { bill: y, payments: [] },
      ],
      cal,
    )

    expect(ranking[0].score).toBe(ranking[1].score)
    expect(ranking.map((r) => r.bill.id)).toEqual(["bill-x", "bill-y"])
  })

  it("test_conta_anual_casa_mesmo_com_pagamento_atrasado_dois_meses", () => {
    // recorrência anual (não-mensal): a janela de busca precisa alcançar a
    // ocorrência de janeiro mesmo com o recibo pago em março.
    const seguro = billBase({
      id: "bill-seguro",
      nome: "Seguro do Carro",
      recurrence: { intervalMonths: 12, anchorMonth: 1 },
      dueRule: { kind: "dia-fixo", day: 10 },
    })
    const recibo = reciboBase({ favorecido: "Seguro do Carro", dataPagamento: "2026-03-10" })

    const ranking = casarReciboConta(recibo, [{ bill: seguro, payments: [] }], cal)

    expect(ranking[0].competencia).toBe("2026-01")
    expect(ranking[0].score).toBeCloseTo(1 / 60)
  })

  it("test_favorecido_substring_de_outro_nome_nao_pontua", () => {
    // "Ana" aparece dentro de "Mariana Andrade" como substring solta — não pode
    // contar como sinal de favorecido (precisa ser token inteiro).
    const contaAna = billBase({
      id: "bill-ana",
      nome: "Ana",
      dueRule: { kind: "dia-fixo", day: 15 },
    })
    const recibo = reciboBase({ favorecido: "Mariana Andrade", dataPagamento: "2026-06-15" })

    const ranking = casarReciboConta(recibo, [{ bill: contaAna, payments: [] }], cal)

    expect(ranking[0].score).toBe(0)
  })

  it("test_sem_sinal_de_data_ranqueia_so_pelo_favorecido", () => {
    const enel = billBase({ id: "bill-enel", nome: "Enel" })
    const internet = billBase({ id: "bill-internet", nome: "Internet" })
    const recibo = reciboBase({ favorecido: "Enel Distribuicao SP", dataPagamento: null })

    const ranking = casarReciboConta(
      recibo,
      [
        { bill: internet, payments: [] },
        { bill: enel, payments: [] },
      ],
      cal,
    )

    expect(ranking[0].bill.id).toBe("bill-enel")
    expect(ranking[0].score).toBeCloseTo(0.7)
    expect(ranking[1].score).toBe(0)
  })
})
