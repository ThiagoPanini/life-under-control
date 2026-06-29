import { describe, expect, it } from "vitest"
import type { Attachment } from "@/core/domain/attachment"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { listAttachmentsDeLancamentos } from "./list-attachments"

function anexo(id: string, paymentId: string, householdId = "h-1"): Attachment {
  return {
    id,
    householdId,
    paymentId,
    chaveR2: `${householdId}/${paymentId}/${id}`,
    uploadedBy: "p-1",
    nomeOriginal: `${id}.pdf`,
    tipoMime: "application/pdf",
    tamanhoBytes: 48_000,
    criadoEm: "2026-06-10T12:00:00.000Z",
  }
}

describe("listAttachmentsDeLancamentos (Seam 1)", () => {
  it("test_agrupa_por_lancamento_e_lista_vazia_quando_sem_anexo", async () => {
    const repo = fakeAttachmentRepo([
      anexo("att-1", "pay-1"),
      anexo("att-2", "pay-1"),
      anexo("att-3", "pay-2"),
    ])

    const mapa = await listAttachmentsDeLancamentos(repo, "h-1", ["pay-1", "pay-2", "pay-3"])

    expect(mapa["pay-1"]).toHaveLength(2)
    expect(mapa["pay-2"]).toHaveLength(1)
    // Lançamento sem anexo sai com lista vazia (a borda renderiza "anexar").
    expect(mapa["pay-3"]).toEqual([])
  })

  it("test_escopa_por_lar", async () => {
    const repo = fakeAttachmentRepo([anexo("att-1", "pay-1", "h-1")])
    const mapa = await listAttachmentsDeLancamentos(repo, "h-outro", ["pay-1"])
    expect(mapa["pay-1"]).toEqual([])
  })
})
