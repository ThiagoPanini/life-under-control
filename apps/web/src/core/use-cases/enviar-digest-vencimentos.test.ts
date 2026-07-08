import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Lar } from "@/core/domain/household"
import type { Payment } from "@/core/domain/payment"
import type { BillRepo } from "@/core/ports/bill-repo"
import type { Clock } from "@/core/ports/clock"
import type { HouseholdRepo } from "@/core/ports/household-repo"
import type { WhatsappMessenger } from "@/core/ports/whatsapp-messenger"
import { fakeCalendar } from "./calendar.fake"
import {
  type DigestDeps,
  enviarDigestVencimentos,
  IDIOMA_DIGEST,
  TEMPLATE_DIGEST,
} from "./enviar-digest-vencimentos"
import { fakePaymentRepo } from "./payment-repo.fake"
import { fakeWhatsappEventRepo } from "./whatsapp-event-repo.fake"
import { fakeWhatsappMessenger } from "./whatsapp-messenger.fake"

const clock = (hoje: string): Clock => ({ hoje: () => hoje })

function fakeHouseholdRepo(lar: Lar | null): HouseholdRepo {
  return { carregarLar: async () => lar }
}

function fakeBillRepo(bills: Bill[]): BillRepo {
  return { listarBills: async (hid) => bills.filter((b) => b.householdId === hid) } as BillRepo
}

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

function historico(id: string, valorMai: number, valorAbr: number): Payment[] {
  return [
    pagamento({ id: `${id}-mai`, billId: id, competencia: "2026-05", valor: valorMai }),
    pagamento({ id: `${id}-abr`, billId: id, competencia: "2026-04", valor: valorAbr }),
  ]
}

function pessoa(id: string, nome: string, whatsappPhone?: string | null) {
  return {
    id,
    nome,
    email: `${nome.toLowerCase()}@casapanini.lar`,
    googleEmail: null,
    hue: 211,
    inicial: nome[0],
    avatarKey: null,
    whatsappPhone,
  }
}

const CASAL: Lar = {
  id: "h-1",
  nome: "Casa Panini",
  pessoas: [pessoa("u-1", "Thiago", "+5511900000001"), pessoa("u-2", "Jakeline", "+5511900000002")],
}

/** Uma vencida (Luz ≈ R$ 110) + uma em breve (Água ≈ R$ 50), total ≈ R$ 160. */
function billsComVencida() {
  return {
    bills: [
      billBase({ id: "luz", nome: "Luz", dueRule: { kind: "dia-fixo", day: 2 } }),
      billBase({ id: "agua", nome: "Água", dueRule: { kind: "dia-fixo", day: 12 } }),
    ],
    payments: [...historico("luz", 10000, 12000), ...historico("agua", 5000, 5000)],
  }
}

function deps(over: Partial<DigestDeps> & { lar: Lar | null; bills: Bill[]; payments: Payment[] }) {
  const messenger = fakeWhatsappMessenger()
  const base: DigestDeps = {
    householdRepo: fakeHouseholdRepo(over.lar),
    billRepo: fakeBillRepo(over.bills),
    paymentRepo: fakePaymentRepo(over.payments),
    eventRepo: over.eventRepo ?? fakeWhatsappEventRepo(),
    messenger: over.messenger ?? messenger,
    clock: over.clock ?? clock("2026-07-10"),
    calendar: fakeCalendar(),
    log: () => {},
  }
  return { deps: base, messenger: base.messenger as ReturnType<typeof fakeWhatsappMessenger> }
}

describe("enviarDigestVencimentos (Seam 1)", () => {
  it("test_ambas_pessoas_recebem_o_mesmo_template", async () => {
    const { bills, payments } = billsComVencida()
    const { deps: d, messenger } = deps({ lar: CASAL, bills, payments })

    const resultado = await enviarDigestVencimentos(d)

    expect(resultado).toEqual({
      status: "enviado",
      enviados: 2,
      jaEnviados: 0,
      falhas: 0,
      semTelefone: 0,
    })
    expect(messenger.templates).toEqual([
      {
        para: "+5511900000001",
        template: {
          nome: TEMPLATE_DIGEST,
          idioma: IDIOMA_DIGEST,
          params: ["Luz ≈ R$ 110", "Água ≈ R$ 50", "≈ R$ 160"],
        },
      },
      {
        para: "+5511900000002",
        template: {
          nome: TEMPLATE_DIGEST,
          idioma: IDIOMA_DIGEST,
          params: ["Luz ≈ R$ 110", "Água ≈ R$ 50", "≈ R$ 160"],
        },
      },
    ])
  })

  it("test_nada_pende_nao_envia_nada", async () => {
    // Conta quitada em julho → farol verde → digest não sai
    const bills = [billBase({ id: "luz" })]
    const payments = [pagamento({ id: "luz-jul", billId: "luz", competencia: "2026-07" })]
    const { deps: d, messenger } = deps({ lar: CASAL, bills, payments })

    const resultado = await enviarDigestVencimentos(d)

    expect(resultado).toEqual({ status: "nada-a-enviar" })
    expect(messenger.templates).toHaveLength(0)
  })

  it("test_disparo_duplicado_no_mesmo_dia_nao_reenvia", async () => {
    const { bills, payments } = billsComVencida()
    const eventRepo = fakeWhatsappEventRepo()
    const { deps: d, messenger } = deps({ lar: CASAL, bills, payments, eventRepo })

    await enviarDigestVencimentos(d)
    const segundo = await enviarDigestVencimentos({ ...d, eventRepo })

    expect(segundo).toEqual({
      status: "enviado",
      enviados: 0,
      jaEnviados: 2,
      falhas: 0,
      semTelefone: 0,
    })
    // só os 2 envios do primeiro disparo
    expect(messenger.templates).toHaveLength(2)
  })

  it("test_envio_recusado_libera_reivindicacao_e_permite_retry", async () => {
    const { bills, payments } = billsComVencida()
    const eventRepo = fakeWhatsappEventRepo()
    // messenger que a Meta recusa (enviarTemplate → false)
    const messengerFalho: WhatsappMessenger = {
      enviarTexto: async () => {},
      enviarBotoes: async () => {},
      enviarLista: async () => {},
      enviarTemplate: async () => false,
    }
    const base: DigestDeps = {
      householdRepo: fakeHouseholdRepo(CASAL),
      billRepo: fakeBillRepo(bills),
      paymentRepo: fakePaymentRepo(payments),
      eventRepo,
      messenger: messengerFalho,
      clock: clock("2026-07-10"),
      calendar: fakeCalendar(),
      log: () => {},
    }

    const falho = await enviarDigestVencimentos(base)
    expect(falho).toEqual({
      status: "enviado",
      enviados: 0,
      jaEnviados: 0,
      falhas: 2,
      semTelefone: 0,
    })

    // como a reivindicação foi liberada, o próximo disparo reenvia — o dia não fica poisonado
    const bom = fakeWhatsappMessenger()
    const retry = await enviarDigestVencimentos({ ...base, messenger: bom })
    expect(retry).toEqual({
      status: "enviado",
      enviados: 2,
      jaEnviados: 0,
      falhas: 0,
      semTelefone: 0,
    })
    expect(bom.templates).toHaveLength(2)
  })

  it("test_sem_lar_nao_envia", async () => {
    const { deps: d, messenger } = deps({ lar: null, bills: [], payments: [] })

    const resultado = await enviarDigestVencimentos(d)

    expect(resultado).toEqual({ status: "sem-lar" })
    expect(messenger.templates).toHaveLength(0)
  })

  it("test_pessoa_sem_telefone_e_pulada", async () => {
    const { bills, payments } = billsComVencida()
    const larMeio: Lar = {
      id: "h-1",
      nome: "Casa Panini",
      pessoas: [pessoa("u-1", "Thiago", "+5511900000001"), pessoa("u-2", "Jakeline", null)],
    }
    const { deps: d, messenger } = deps({ lar: larMeio, bills, payments })

    const resultado = await enviarDigestVencimentos(d)

    expect(resultado).toEqual({
      status: "enviado",
      enviados: 1,
      jaEnviados: 0,
      falhas: 0,
      semTelefone: 1,
    })
    expect(messenger.templates).toHaveLength(1)
    expect(messenger.templates[0].para).toBe("+5511900000001")
  })
})
