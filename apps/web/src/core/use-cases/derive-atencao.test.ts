import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { derivarAtencaoDoPainel, derivarHeroAreaAtiva, derivarTiraAtencao } from "./derive-atencao"

const clock = (hoje: string): Clock => ({ hoje: () => hoje })
const calendar = fakeCalendar()

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

describe("derivarTiraAtencao (Seam 1)", () => {
  it("test_farol_vermelho_entra_na_tira_com_frase_origem_e_estimativa", () => {
    const bills = [billBase({ id: "luz" })]
    const pagos = [
      pagamento({ id: "luz-mai", billId: "luz", competencia: "2026-05", valor: 10000 }),
      pagamento({ id: "luz-abr", billId: "luz", competencia: "2026-04", valor: 12000 }),
    ]
    // hoje 2026-07-10, vencimento da competência 2026-07 é dia 10 → vence hoje (vermelho)
    const tira = derivarTiraAtencao(clock("2026-07-10"), calendar, bills, pagos)

    expect(tira.estado).toBe("pendente")
    if (tira.estado !== "pendente") throw new Error("unreachable")
    expect(tira.itens).toEqual([
      {
        contaId: "luz",
        titulo: "Luz",
        competencia: "2026-07",
        farol: "vermelho",
        frase: "vence hoje",
        detalhe: "competência de julho, sem Lançamento",
        origem: "Finanças · Pagamentos Recorrentes",
        valorEstimado: 11000,
      },
    ])
    expect(tira.totalEstimado).toBe(11000)
  })

  it("test_nada_pende_estado_calma_nunca_lista_vazia", () => {
    const bills = [billBase({ id: "luz" })]
    const pagos = [pagamento({ id: "luz-jul", billId: "luz", competencia: "2026-07" })]
    // já quitada em julho → farol verde, fora da tira
    const tira = derivarTiraAtencao(clock("2026-07-10"), calendar, bills, pagos)
    expect(tira).toEqual({ estado: "calma" })
  })

  it("test_ordena_vermelho_antes_de_amarelo_e_encerrada_nao_entra", () => {
    const bills = [
      billBase({ id: "amarela", nome: "Água", dueRule: { kind: "dia-fixo", day: 12 } }),
      billBase({ id: "vermelha", nome: "Luz", dueRule: { kind: "dia-fixo", day: 2 } }),
      billBase({ id: "fora", nome: "Encerrada", estado: "encerrada" }),
    ]
    const tira = derivarTiraAtencao(clock("2026-07-10"), calendar, bills, [])
    expect(tira.estado).toBe("pendente")
    if (tira.estado !== "pendente") throw new Error("unreachable")
    expect(tira.itens.map((item) => item.contaId)).toEqual(["vermelha", "amarela"])
  })

  it("test_sem_historico_valor_estimado_null_e_fora_do_total", () => {
    const bills = [billBase({ id: "nova", nome: "Internet" })]
    const tira = derivarTiraAtencao(clock("2026-07-10"), calendar, bills, [])
    expect(tira.estado).toBe("pendente")
    if (tira.estado !== "pendente") throw new Error("unreachable")
    expect(tira.itens[0].valorEstimado).toBeNull()
    expect(tira.totalEstimado).toBeNull()
  })
})

describe("derivarHeroAreaAtiva (Seam 1)", () => {
  it("test_manchete_quitadas_proxima_e_pista_do_mes", () => {
    const bills = [
      billBase({ id: "luz", nome: "Luz", dueRule: { kind: "dia-fixo", day: 2 } }),
      billBase({ id: "agua", nome: "Água", dueRule: { kind: "dia-fixo", day: 20 } }),
    ]
    const pagos = [pagamento({ id: "luz-jul", billId: "luz", competencia: "2026-07" })]
    const hero = derivarHeroAreaAtiva(clock("2026-07-10"), calendar, bills, pagos)

    expect(hero.competencia).toBe("2026-07")
    expect(hero.quitadas).toEqual({ quitadas: 1, total: 2 })
    expect(hero.proxima).toEqual({ titulo: "Água", frase: "em 10 dias" })
    expect(hero.pista).toHaveLength(2)
  })

  it("test_proxima_null_quando_tudo_quitado", () => {
    const bills = [billBase({ id: "luz" })]
    const pagos = [pagamento({ id: "luz-jul", billId: "luz", competencia: "2026-07" })]
    const hero = derivarHeroAreaAtiva(clock("2026-07-10"), calendar, bills, pagos)
    expect(hero.proxima).toBeNull()
  })

  it("test_conta_vencida_nao_vira_proxima_ela_ja_esta_na_tira", () => {
    const bills = [
      billBase({ id: "agua", nome: "Água", dueRule: { kind: "dia-fixo", day: 2 } }),
      billBase({ id: "aluguel", nome: "Aluguel", dueRule: { kind: "dia-fixo", day: 25 } }),
    ]
    // hoje 2026-07-10: Água já venceu (dia 2), Aluguel ainda vem pela frente (dia 25)
    const hero = derivarHeroAreaAtiva(clock("2026-07-10"), calendar, bills, [])
    expect(hero.proxima).toEqual({ titulo: "Aluguel", frase: "em 15 dias" })
  })
})

describe("derivarAtencaoDoPainel (Seam 1)", () => {
  it("test_compoe_tira_e_hero_do_mesmo_clock", () => {
    const bills = [billBase({ id: "luz", dueRule: { kind: "dia-fixo", day: 2 } })]
    const painel = derivarAtencaoDoPainel(clock("2026-07-10"), calendar, bills, [])
    expect(painel.tira.estado).toBe("pendente")
    expect(painel.hero.competencia).toBe("2026-07")
  })
})
