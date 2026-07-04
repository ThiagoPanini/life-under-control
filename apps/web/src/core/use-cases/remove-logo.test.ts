import { describe, expect, it } from "vitest"
import type { Bill, DadosBill } from "../domain/bill"
import type { BillRepo, NovaBill } from "../ports/bill-repo"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { removeLogo } from "./remove-logo"

/** Fake mínimo do `BillRepo` (Seam 1) — só o que `removeLogo` usa. */
function fakeBillRepo(): BillRepo & { bills: Bill[] } {
  const bills: Bill[] = []
  return {
    bills,
    async criarBill(nova: NovaBill) {
      const bill: Bill = {
        id: `bill-${bills.length + 1}`,
        estado: "ativa",
        encerradaEm: null,
        logoKey: null,
        ...nova,
      }
      bills.push(bill)
      return bill
    },
    async listarBills(householdId) {
      return bills.filter((b) => b.householdId === householdId)
    },
    async obterBill(householdId, billId) {
      return bills.find((b) => b.householdId === householdId && b.id === billId) ?? null
    },
    async editarBill(_householdId, _billId, _dados: DadosBill) {
      throw new Error("não usado neste teste")
    },
    async encerrarBill() {
      throw new Error("não usado neste teste")
    },
    async reativarBill() {
      throw new Error("não usado neste teste")
    },
    async contarDependentes() {
      return { lancamentos: 0, anexos: 0 }
    },
    async deletarBill() {
      throw new Error("não usado neste teste")
    },
    async definirLogo(householdId, billId, logoKey) {
      const bill = bills.find((b) => b.householdId === householdId && b.id === billId)
      if (!bill) return null
      bill.logoKey = logoKey
      return bill
    },
  }
}

const DADOS: DadosBill = {
  nome: "Internet",
  descricao: null,
  icon: "wifi",
  recurrence: { intervalMonths: 1, anchorMonth: null },
  dueRule: { kind: "dia-fixo", day: 15 },
  dueMonthOffset: 0,
}

describe("removeLogo (Seam 1)", () => {
  it("test_remove_apaga_logo_key_e_objeto", async () => {
    const repo = fakeBillRepo()
    const bill = await repo.criarBill({ householdId: "h-1", ...DADOS })
    const chave = `finance/bills/h-1/${bill.id}/logo`
    await repo.definirLogo("h-1", bill.id, chave)
    const store = fakeAttachmentStore([{ chave, tamanhoBytes: 20_000, tipoMime: "image/png" }])

    const atualizada = await removeLogo(repo, store, "h-1", bill.id)

    expect(atualizada.logoKey).toBeNull()
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_remove_sem_logo_e_idempotente_e_nao_toca_o_bucket", async () => {
    const repo = fakeBillRepo()
    const bill = await repo.criarBill({ householdId: "h-1", ...DADOS })
    const store = fakeAttachmentStore([
      { chave: "outra/chave", tamanhoBytes: 1, tipoMime: "image/png" },
    ])

    const atualizada = await removeLogo(repo, store, "h-1", bill.id)

    expect(atualizada.logoKey).toBeNull()
    expect(store.chaves()).toEqual(["outra/chave"])
  })

  it("test_conta_inexistente_lanca_nao_encontrada", async () => {
    const repo = fakeBillRepo()
    const store = fakeAttachmentStore()
    await expect(removeLogo(repo, store, "h-1", "sumida")).rejects.toThrow("Conta não encontrada")
  })

  it("test_remove_de_outro_lar_lanca_nao_encontrada_e_nao_apaga", async () => {
    const repo = fakeBillRepo()
    const bill = await repo.criarBill({ householdId: "h-1", ...DADOS })
    const chave = `finance/bills/h-1/${bill.id}/logo`
    await repo.definirLogo("h-1", bill.id, chave)
    const store = fakeAttachmentStore([{ chave, tamanhoBytes: 20_000, tipoMime: "image/png" }])

    await expect(removeLogo(repo, store, "h-outro", bill.id)).rejects.toThrow(
      "Conta não encontrada",
    )
    expect(store.chaves()).toEqual([chave])
  })
})
