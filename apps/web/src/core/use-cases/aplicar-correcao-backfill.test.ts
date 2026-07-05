import { describe, expect, it } from "vitest"
import {
  type EstadoContaCorrecao,
  planejarCorrecaoConta,
  type RegraCorrecaoConta,
} from "@/core/domain/backfill-correcao"
import type { Bill, DadosBill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { BillRepo, DependentesBill } from "@/core/ports/bill-repo"
import { aplicarCorrecaoBackfill } from "./aplicar-correcao-backfill"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { fakePaymentRepo } from "./payment-repo.fake"

const HH = "casa-panini"

function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-cond",
    householdId: HH,
    nome: "Condomínio",
    descricao: null,
    icon: "building-2",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 1,
    primeiraCompetencia: "2023-08",
    estado: "ativa",
    encerradaEm: null,
    logoKey: null,
    ...over,
  }
}

function payment(over: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    householdId: HH,
    billId: "bill-cond",
    valor: 60000,
    dataPagamento: "2023-09-08",
    competencia: "2023-08",
    paidBy: "p-thi",
    ...over,
  }
}

function fakeBillRepo(seed: Bill[]): BillRepo & { bills: Map<string, Bill> } {
  const bills = new Map(seed.map((b) => [b.id, b]))
  const acha = (householdId: string, billId: string) => {
    const b = bills.get(billId)
    return b && b.householdId === householdId ? b : null
  }
  return {
    bills,
    async criarBill() {
      throw new Error("não usado")
    },
    async listarBills(householdId) {
      return [...bills.values()].filter((b) => b.householdId === householdId)
    },
    async obterBill(householdId, billId) {
      return acha(householdId, billId)
    },
    async editarBill(householdId, billId, dados: DadosBill) {
      const atual = acha(householdId, billId)
      if (!atual) return null
      const editada = { ...atual, ...dados }
      bills.set(billId, editada)
      return editada
    },
    async encerrarBill(householdId, billId, encerradaEm) {
      const atual = acha(householdId, billId)
      if (!atual) return null
      if (atual.estado !== "ativa") return null
      const encerrada: Bill = { ...atual, estado: "encerrada", encerradaEm }
      bills.set(billId, encerrada)
      return encerrada
    },
    async reativarBill() {
      throw new Error("não usado")
    },
    async contarDependentes(): Promise<DependentesBill> {
      throw new Error("não usado")
    },
    async deletarBill() {
      throw new Error("não usado")
    },
    async definirLogo() {
      throw new Error("não usado")
    },
  }
}

const REGRA_COND: RegraCorrecaoConta = {
  billId: "bill-cond",
  shift: 1,
  dueMonthOffsetAlvo: 0,
  dueRuleDayAlvo: null,
  encerrarEm: null,
}

async function estadoDaConta(
  billRepo: BillRepo,
  paymentRepo: ReturnType<typeof fakePaymentRepo>,
  attachmentRepo: ReturnType<typeof fakeAttachmentRepo>,
  billId: string,
): Promise<EstadoContaCorrecao> {
  const b = await billRepo.obterBill(HH, billId)
  if (!b) throw new Error("conta some no teste")
  const payments = await paymentRepo.listarPayments(HH, billId)
  const attachments = await attachmentRepo.listarAttachmentsPorPayments(
    HH,
    payments.map((p) => p.id),
  )
  return {
    bill: {
      id: b.id,
      dueMonthOffset: b.dueMonthOffset,
      dueRuleDay: b.dueRule.kind === "dia-fixo" ? b.dueRule.day : null,
      primeiraCompetencia: b.primeiraCompetencia,
      estado: b.estado,
    },
    payments: payments.map((p) => ({ id: p.id, competencia: p.competencia })),
    attachments: attachments.map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      nomeOriginal: a.nomeOriginal,
    })),
  }
}

describe("aplicarCorrecaoBackfill (Seam 4 — o plano vira estado pelas ports)", () => {
  it("test_plano_pendente_atualiza_payments_anexos_e_conta", async () => {
    const billRepo = fakeBillRepo([bill()])
    const paymentRepo = fakePaymentRepo([
      payment(),
      payment({ id: "p2", competencia: "2023-09", dataPagamento: "2023-10-09" }),
    ])
    const attachmentRepo = fakeAttachmentRepo([
      {
        id: "a1",
        householdId: HH,
        paymentId: "p1",
        nomeOriginal: "condominio-202308.jpeg",
        tipoMime: "image/jpeg",
        tamanhoBytes: 1000,
        chaveR2: "finance/payments/hh/p1/a1",
        uploadedBy: "p-thi",
        criadoEm: "2026-01-01T00:00:00.000Z",
      },
    ])

    const antes = await estadoDaConta(billRepo, paymentRepo, attachmentRepo, "bill-cond")
    const plano = planejarCorrecaoConta(REGRA_COND, antes, ["2023-09", "2023-10"])
    const resultado = await aplicarCorrecaoBackfill(billRepo, paymentRepo, attachmentRepo, HH, [
      plano,
    ])

    expect(resultado.contasAplicadas).toBe(1)
    expect(resultado.paymentsAtualizados).toBe(2)
    expect(resultado.anexosRenomeados).toBe(1)
    expect(resultado.billsAtualizadas).toBe(1)

    const payments = await paymentRepo.listarPayments(HH, "bill-cond")
    expect(payments.map((p) => p.competencia).sort()).toEqual(["2023-09", "2023-10"])
    const p1 = payments.find((p) => p.id === "p1")
    expect(p1?.dataPagamento).toBe("2023-09-08")
    expect(p1?.valor).toBe(60000)

    const a1 = await attachmentRepo.obterAttachment(HH, "a1")
    expect(a1?.nomeOriginal).toBe("condominio-202309.jpeg")

    const conta = await billRepo.obterBill(HH, "bill-cond")
    expect(conta?.dueMonthOffset).toBe(0)
    expect(conta?.primeiraCompetencia).toBe("2023-09")
    expect(conta?.dueRule).toEqual({ kind: "dia-fixo", day: 10 })
  })

  it("test_segundo_ciclo_gera_plano_vazio_e_nao_altera_nada", async () => {
    const billRepo = fakeBillRepo([bill()])
    const paymentRepo = fakePaymentRepo([payment()])
    const attachmentRepo = fakeAttachmentRepo()
    const verdade = ["2023-09"]

    const primeiro = planejarCorrecaoConta(
      REGRA_COND,
      await estadoDaConta(billRepo, paymentRepo, attachmentRepo, "bill-cond"),
      verdade,
    )
    await aplicarCorrecaoBackfill(billRepo, paymentRepo, attachmentRepo, HH, [primeiro])

    const segundo = planejarCorrecaoConta(
      REGRA_COND,
      await estadoDaConta(billRepo, paymentRepo, attachmentRepo, "bill-cond"),
      verdade,
    )
    expect(segundo.situacao).toBe("corrigida")

    const resultado = await aplicarCorrecaoBackfill(billRepo, paymentRepo, attachmentRepo, HH, [
      segundo,
    ])
    expect(resultado.contasCorrigidas).toBe(1)
    expect(resultado.contasAplicadas).toBe(0)
    expect(resultado.paymentsAtualizados).toBe(0)
    const payments = await paymentRepo.listarPayments(HH, "bill-cond")
    expect(payments[0].competencia).toBe("2023-09")
  })

  it("test_plano_inconsistente_nao_escreve_nada", async () => {
    const billRepo = fakeBillRepo([bill()])
    const paymentRepo = fakePaymentRepo([payment({ competencia: "2023-11" })])
    const attachmentRepo = fakeAttachmentRepo()

    const plano = planejarCorrecaoConta(
      REGRA_COND,
      await estadoDaConta(billRepo, paymentRepo, attachmentRepo, "bill-cond"),
      ["2023-09"],
    )
    expect(plano.situacao).toBe("inconsistente")

    const resultado = await aplicarCorrecaoBackfill(billRepo, paymentRepo, attachmentRepo, HH, [
      plano,
    ])
    expect(resultado.contasInconsistentes).toBe(1)
    const payments = await paymentRepo.listarPayments(HH, "bill-cond")
    expect(payments[0].competencia).toBe("2023-11")
    expect((await billRepo.obterBill(HH, "bill-cond"))?.dueMonthOffset).toBe(1)
  })

  it("test_encerramento_do_das_aplica_uma_vez_e_vira_no_op", async () => {
    const das = bill({
      id: "bill-das",
      nome: "DAS Jakeline",
      dueMonthOffset: 0,
      dueRule: { kind: "dia-fixo", day: 20 },
      primeiraCompetencia: "2025-10",
    })
    const billRepo = fakeBillRepo([das])
    const paymentRepo = fakePaymentRepo([
      payment({ id: "p9", billId: "bill-das", competencia: "2025-10", paidBy: "p-jake" }),
    ])
    const attachmentRepo = fakeAttachmentRepo()
    const regraDas: RegraCorrecaoConta = {
      billId: "bill-das",
      shift: 0,
      dueMonthOffsetAlvo: 0,
      dueRuleDayAlvo: null,
      encerrarEm: "2025-10-31",
    }

    const plano = planejarCorrecaoConta(
      regraDas,
      await estadoDaConta(billRepo, paymentRepo, attachmentRepo, "bill-das"),
      ["2025-10"],
    )
    const resultado = await aplicarCorrecaoBackfill(billRepo, paymentRepo, attachmentRepo, HH, [
      plano,
    ])

    expect(resultado.encerradas).toBe(1)
    const encerrada = await billRepo.obterBill(HH, "bill-das")
    expect(encerrada?.estado).toBe("encerrada")
    expect(encerrada?.encerradaEm).toBe("2025-10-31")

    const replano = planejarCorrecaoConta(
      regraDas,
      await estadoDaConta(billRepo, paymentRepo, attachmentRepo, "bill-das"),
      ["2025-10"],
    )
    expect(replano.situacao).toBe("corrigida")
    expect(replano.encerramento).toBeNull()
  })
})
