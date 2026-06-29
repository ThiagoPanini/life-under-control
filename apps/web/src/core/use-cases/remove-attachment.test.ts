import { describe, expect, it } from "vitest"
import type { Attachment } from "@/core/domain/attachment"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { removeAttachment } from "./remove-attachment"

function anexo(over: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    householdId: "h-1",
    paymentId: "pay-1",
    chaveR2: "h-1/pay-1/att-1",
    uploadedBy: "p-1",
    nomeOriginal: "comprovante.pdf",
    tipoMime: "application/pdf",
    tamanhoBytes: 48_000,
    criadoEm: "2026-06-10T12:00:00.000Z",
    ...over,
  }
}

describe("removeAttachment (Seam 1)", () => {
  it("test_remove_apaga_metadado_e_objeto", async () => {
    const repo = fakeAttachmentRepo([anexo()])
    const store = fakeAttachmentStore([
      { chave: "h-1/pay-1/att-1", tamanhoBytes: 48_000, tipoMime: "application/pdf" },
    ])

    const ok = await removeAttachment(store, repo, "h-1", "att-1")

    expect(ok).toBe(true)
    expect(await repo.listarAttachments("h-1", "pay-1")).toHaveLength(0)
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_remove_inexistente_devolve_false_e_nao_toca_o_bucket", async () => {
    const repo = fakeAttachmentRepo()
    const store = fakeAttachmentStore([
      { chave: "h-1/pay-1/att-1", tamanhoBytes: 48_000, tipoMime: "application/pdf" },
    ])

    const ok = await removeAttachment(store, repo, "h-1", "att-x")

    expect(ok).toBe(false)
    // o bucket fica intacto — não apagou objeto de chave que não era do metadado
    expect(store.chaves()).toEqual(["h-1/pay-1/att-1"])
  })

  it("test_remove_de_outro_lar_nao_apaga", async () => {
    const repo = fakeAttachmentRepo([anexo()])
    const store = fakeAttachmentStore([
      { chave: "h-1/pay-1/att-1", tamanhoBytes: 48_000, tipoMime: "application/pdf" },
    ])

    expect(await removeAttachment(store, repo, "h-outro", "att-1")).toBe(false)
    expect(await repo.listarAttachments("h-1", "pay-1")).toHaveLength(1)
    expect(store.chaves()).toEqual(["h-1/pay-1/att-1"])
  })
})
