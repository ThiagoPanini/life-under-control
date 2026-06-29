import { describe, expect, it } from "vitest"
import type { Attachment } from "@/core/domain/attachment"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { openAttachment } from "./open-attachment"

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

describe("openAttachment (Seam 1)", () => {
  it("test_resgata_assina_a_leitura_pela_chave_do_anexo", async () => {
    const repo = fakeAttachmentRepo([anexo()])
    const store = fakeAttachmentStore()

    const url = await openAttachment(store, repo, "h-1", "att-1")

    expect(url).toBe(`https://r2.fake/get/${encodeURIComponent("h-1/pay-1/att-1")}`)
  })

  it("test_anexo_inexistente_devolve_null", async () => {
    const repo = fakeAttachmentRepo()
    const store = fakeAttachmentStore()
    expect(await openAttachment(store, repo, "h-1", "att-x")).toBeNull()
  })

  it("test_anexo_de_outro_lar_devolve_null", async () => {
    const repo = fakeAttachmentRepo([anexo()])
    const store = fakeAttachmentStore()
    expect(await openAttachment(store, repo, "h-outro", "att-1")).toBeNull()
  })
})
