import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { derivarConteudoDigest } from "./derive-digest-vencimentos"

const clock = (hoje: string): Clock => ({ hoje: () => hoje })
const calendar = fakeCalendar()

/** Conta mensal, dia-fixo, sem offset — base que cada teste muta. */
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

/** Duas competências de histórico (média 11000) para a Conta `id`. */
function historico(id: string, valorMai: number, valorAbr: number): Payment[] {
  return [
    pagamento({ id: `${id}-mai`, billId: id, competencia: "2026-05", valor: valorMai }),
    pagamento({ id: `${id}-abr`, billId: id, competencia: "2026-04", valor: valorAbr }),
  ]
}

describe("derivarConteudoDigest (Seam 1)", () => {
  it("test_nada_pende_nao_envia_digest", () => {
    const bills = [billBase({ id: "luz" })]
    // já quitada em julho → farol verde, fora da tira → digest não sai
    const pagos = [pagamento({ id: "luz-jul", billId: "luz", competencia: "2026-07" })]
    const conteudo = derivarConteudoDigest(clock("2026-07-10"), calendar, bills, pagos)
    expect(conteudo).toEqual({ enviar: false })
  })

  it("test_so_vence_em_breve_bucket_vencidas_nenhuma", () => {
    // dia-fixo 12, hoje 2026-07-10 → vence em 2 dias → amarelo
    const bills = [billBase({ id: "agua", nome: "Água", dueRule: { kind: "dia-fixo", day: 12 } })]
    const pagos = historico("agua", 5000, 5000)
    const conteudo = derivarConteudoDigest(clock("2026-07-10"), calendar, bills, pagos)
    expect(conteudo).toEqual({
      enviar: true,
      params: {
        vencidas: "nenhuma",
        venceEmBreve: "Água ≈ R$ 50",
        totalEstimado: "≈ R$ 50",
      },
    })
  })

  it("test_mistura_vencida_e_em_breve_dois_buckets_por_farol", () => {
    const bills = [
      // dia-fixo 2, hoje 2026-07-10 → venceu há 8 dias → vermelho
      billBase({ id: "luz", nome: "Luz", dueRule: { kind: "dia-fixo", day: 2 } }),
      // dia-fixo 12 → vence em 2 dias → amarelo
      billBase({ id: "agua", nome: "Água", dueRule: { kind: "dia-fixo", day: 12 } }),
    ]
    const pagos = [...historico("luz", 10000, 12000), ...historico("agua", 5000, 5000)]
    const conteudo = derivarConteudoDigest(clock("2026-07-10"), calendar, bills, pagos)
    expect(conteudo).toEqual({
      enviar: true,
      params: {
        vencidas: "Luz ≈ R$ 110",
        venceEmBreve: "Água ≈ R$ 50",
        totalEstimado: "≈ R$ 160",
      },
    })
  })

  it("test_sem_historico_item_so_titulo_e_total_sem_estimativa", () => {
    // amarela, sem pagamentos → valorEstimado null → total null
    const bills = [
      billBase({ id: "net", nome: "Internet", dueRule: { kind: "dia-fixo", day: 12 } }),
    ]
    const conteudo = derivarConteudoDigest(clock("2026-07-10"), calendar, bills, [])
    expect(conteudo).toEqual({
      enviar: true,
      params: {
        vencidas: "nenhuma",
        venceEmBreve: "Internet",
        totalEstimado: "sem estimativa",
      },
    })
  })
})
