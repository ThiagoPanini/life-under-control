import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { projetarAgenda } from "./project-agenda"

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

describe("projetarAgenda (Seam 1)", () => {
  const cal = fakeCalendar()

  it("test_lista_ocorrencias_nao_pagas_do_mes_vigente_e_proximo_ordenadas_no_tempo", () => {
    const bills = [
      billBase({ id: "netflix", nome: "Netflix", dueRule: { kind: "dia-fixo", day: 15 } }),
      billBase({ id: "luz", nome: "Luz", dueRule: { kind: "dia-fixo", day: 10 } }),
    ]
    const itens = projetarAgenda(clock("2026-06-05"), cal, bills, [])
    expect(itens.map((i) => `${i.titulo} ${i.vencimento}`)).toEqual([
      "Luz 2026-06-10",
      "Netflix 2026-06-15",
      "Luz 2026-07-10",
      "Netflix 2026-07-15",
    ])
  })

  it("test_ocorrencia_paga_sai_da_agenda", () => {
    const bills = [billBase({ id: "luz", nome: "Luz" })]
    const pagos = [pagamento({ billId: "luz", competencia: "2026-06" })]
    const itens = projetarAgenda(clock("2026-06-05"), cal, bills, pagos)
    // junho pago → sobra só a ocorrência de julho
    expect(itens.map((i) => i.competencia)).toEqual(["2026-07"])
  })

  it("test_vencida_e_em_aberto_a_vencer_e_aguardando", () => {
    // hoje 12/06: venc 10/06 (vigente) já passou → em-aberto; venc 10/07 (próximo) → aguardando
    const itens = projetarAgenda(clock("2026-06-12"), cal, [billBase()], [])
    expect(itens.map((i) => i.estado)).toEqual(["em-aberto", "aguardando"])
  })

  it("test_vence_hoje_conta_como_em_aberto", () => {
    const itens = projetarAgenda(clock("2026-06-10"), cal, [billBase()], [])
    expect(itens[0]).toMatchObject({ vencimento: "2026-06-10", estado: "em-aberto" })
  })

  it("test_ignora_conta_encerrada", () => {
    const bills = [
      billBase({ id: "viva", nome: "Viva" }),
      billBase({ id: "morta", nome: "Morta", estado: "encerrada", encerradaEm: "2026-01-01" }),
    ]
    const itens = projetarAgenda(clock("2026-06-05"), cal, bills, [])
    expect(new Set(itens.map((i) => i.geradorId))).toEqual(new Set(["viva"]))
  })

  it("test_conta_bimestral_so_aparece_no_mes_de_ocorrencia", () => {
    // bimestral ancorada em junho (6): em 05/06 a ocorrência corrente é junho; a
    // seguinte (agosto) vence fora da janela → só junho aparece.
    const bill = billBase({ recurrence: { intervalMonths: 2, anchorMonth: 6 } })
    const itens = projetarAgenda(clock("2026-06-05"), cal, [bill], [])
    expect(itens.map((i) => i.competencia)).toEqual(["2026-06"])
  })

  it("test_conta_bimestral_em_mes_off_mostra_a_ocorrencia_vencida", () => {
    // bimestral ancorada em maio (5): em 30/06 a ocorrência corrente é a de maio,
    // já vencida e não paga (paridade com o farol vermelho do card, que olha a
    // mesma ocorrência). A seguinte (julho) entra na janela como a vencer.
    const bill = billBase({ recurrence: { intervalMonths: 2, anchorMonth: 5 } })
    const itens = projetarAgenda(clock("2026-06-30"), cal, [bill], [])
    expect(itens.map((i) => `${i.competencia} ${i.estado}`)).toEqual([
      "2026-05 em-aberto",
      "2026-07 aguardando",
    ])
  })

  it("test_offset_desloca_o_vencimento_e_o_que_vence_alem_da_janela_fica_de_fora", () => {
    // condomínio: competência +1. Em 05/06 a competência 06 vence 07/10 (na janela,
    // mês vigente + próximo); a competência 07 venceria 08/10, além da janela → fora.
    const bill = billBase({ dueRule: { kind: "dia-fixo", day: 10 }, dueMonthOffset: 1 })
    const itens = projetarAgenda(clock("2026-06-05"), cal, [bill], [])
    expect(itens.map((i) => i.vencimento)).toEqual(["2026-07-10"])
  })

  it("test_empate_no_vencimento_desempata_por_titulo", () => {
    const bills = [
      billBase({ id: "z", nome: "Zeladoria", dueRule: { kind: "dia-fixo", day: 10 } }),
      billBase({ id: "a", nome: "Água", dueRule: { kind: "dia-fixo", day: 10 } }),
    ]
    const itens = projetarAgenda(clock("2026-06-05"), cal, bills, [])
    expect(itens.filter((i) => i.competencia === "2026-06").map((i) => i.titulo)).toEqual([
      "Água",
      "Zeladoria",
    ])
  })

  it("test_item_clicavel_aponta_conta_e_competencia", () => {
    const bill = billBase({ id: "netflix", nome: "Netflix" })
    const itens = projetarAgenda(clock("2026-06-05"), cal, [bill], [])
    expect(itens[0]).toMatchObject({
      area: "financas",
      geradorId: "netflix",
      competencia: "2026-06",
    })
  })

  it("test_item_nao_carrega_valor", () => {
    // invariante #5: a Agenda projeta o "quando", jamais o "quanto".
    const itens = projetarAgenda(clock("2026-06-05"), cal, [billBase()], [])
    expect(itens[0]).not.toHaveProperty("valor")
  })

  it("test_sem_contas_ativas_a_agenda_e_vazia", () => {
    expect(projetarAgenda(clock("2026-06-05"), cal, [], [])).toEqual([])
  })
})
