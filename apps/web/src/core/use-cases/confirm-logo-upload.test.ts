import { describe, expect, it } from "vitest"
import type { Bill, DadosBill } from "../domain/bill"
import type { BillRepo, NovaBill } from "../ports/bill-repo"
import { fakeAttachmentStore, type ObjetoFake } from "./attachment-store.fake"
import { confirmLogoUpload } from "./confirm-logo-upload"
import { AttachmentInvalidoError } from "./prepare-attachment-upload"

/** Fake mínimo do `BillRepo` (Seam 1) — só o que `confirmLogoUpload` usa. */
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
  primeiraCompetencia: "2020-01",
}

async function comUmaConta(repo: BillRepo & { bills: Bill[] }) {
  return repo.criarBill({ householdId: "h-1", ...DADOS })
}

function objeto(over: Partial<ObjetoFake> = {}): ObjetoFake {
  return {
    chave: "finance/bills/h-1/bill-1/up-1",
    tamanhoBytes: 20_000,
    tipoMime: "image/png",
    ...over,
  }
}

describe("confirmLogoUpload (Seam 1)", () => {
  it("test_confirma_persiste_logo_key_observado_no_r2", async () => {
    const repo = fakeBillRepo()
    const bill = await comUmaConta(repo)
    const store = fakeAttachmentStore([objeto({ chave: `finance/bills/h-1/${bill.id}/up-1` })])

    const atualizada = await confirmLogoUpload(repo, store, "h-1", bill.id, "up-1")

    expect(atualizada.logoKey).toBe(`finance/bills/h-1/${bill.id}/up-1`)
  })

  it("test_upload_ausente_lanca_e_nao_seta_logo", async () => {
    const repo = fakeBillRepo()
    const bill = await comUmaConta(repo)
    const store = fakeAttachmentStore([]) // nada subido nessa chave

    await expect(confirmLogoUpload(repo, store, "h-1", bill.id, "up-1")).rejects.toBeInstanceOf(
      AttachmentInvalidoError,
    )
    expect(repo.bills[0]?.logoKey).toBeNull()
  })

  it("test_tipo_real_nao_imagem_lanca_e_nao_seta_logo", async () => {
    const repo = fakeBillRepo()
    const bill = await comUmaConta(repo)
    const store = fakeAttachmentStore([
      objeto({ chave: `finance/bills/h-1/${bill.id}/up-1`, tipoMime: "application/pdf" }),
    ])

    await expect(confirmLogoUpload(repo, store, "h-1", bill.id, "up-1")).rejects.toBeInstanceOf(
      AttachmentInvalidoError,
    )
    expect(repo.bills[0]?.logoKey).toBeNull()
  })

  it("test_conta_inexistente_lanca_nao_encontrada", async () => {
    const repo = fakeBillRepo()
    const store = fakeAttachmentStore([objeto({ chave: "finance/bills/h-1/sumida/up-1" })])

    await expect(confirmLogoUpload(repo, store, "h-1", "sumida", "up-1")).rejects.toThrow(
      "Conta não encontrada",
    )
  })

  it("test_conta_inexistente_lanca_nao_encontrada_mesmo_sem_objeto_no_r2", async () => {
    // a Conta some (outra Pessoa deletou) e a confirmação é retomada/duplicada:
    // deve sinalizar Conta ausente, não "upload não encontrado" — a borda
    // trata os dois tipos de erro de formas diferentes (redirect vs. mensagem inline).
    const repo = fakeBillRepo()
    const store = fakeAttachmentStore([])

    await expect(confirmLogoUpload(repo, store, "h-1", "sumida", "up-1")).rejects.toThrow(
      "Conta não encontrada",
    )
  })

  it("test_confirmar_um_logo_novo_limpa_o_logo_anterior_no_r2", async () => {
    const repo = fakeBillRepo()
    const bill = await comUmaConta(repo)
    const chaveAntiga = `finance/bills/h-1/${bill.id}/up-1`
    const chaveNova = `finance/bills/h-1/${bill.id}/up-2`
    await repo.definirLogo("h-1", bill.id, chaveAntiga)
    const store = fakeAttachmentStore([
      { chave: chaveAntiga, tamanhoBytes: 20_000, tipoMime: "image/png" },
      { chave: chaveNova, tamanhoBytes: 30_000, tipoMime: "image/png" },
    ])

    const atualizada = await confirmLogoUpload(repo, store, "h-1", bill.id, "up-2")

    expect(atualizada.logoKey).toBe(chaveNova)
    // o objeto antigo foi limpo; o novo, o único que resta no bucket
    expect(store.chaves()).toEqual([chaveNova])
  })

  it("test_confirmar_o_primeiro_logo_nao_toca_o_bucket_alem_do_proprio_objeto", async () => {
    const repo = fakeBillRepo()
    const bill = await comUmaConta(repo)
    const chave = `finance/bills/h-1/${bill.id}/up-1`
    const store = fakeAttachmentStore([{ chave, tamanhoBytes: 20_000, tipoMime: "image/png" }])

    await confirmLogoUpload(repo, store, "h-1", bill.id, "up-1")

    expect(store.chaves()).toEqual([chave])
  })
})
