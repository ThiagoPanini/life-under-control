import { describe, expect, it } from "vitest"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { fakeAttachmentStore, type ObjetoFake } from "./attachment-store.fake"
import { AttachmentInvalidoError } from "./prepare-attachment-upload"
import { registerAttachment } from "./register-attachment"

/** Um objeto "já subido" no R2 fake, na chave que o registro vai derivar. */
function objeto(over: Partial<ObjetoFake> = {}): ObjetoFake {
  return {
    chave: "h-1/pay-1/att-1",
    tamanhoBytes: 48_000,
    tipoMime: "application/pdf",
    ...over,
  }
}

describe("registerAttachment (Seam 1)", () => {
  it("test_registra_persiste_metadados_observados_no_r2", async () => {
    const repo = fakeAttachmentRepo()
    const store = fakeAttachmentStore([objeto()])

    const att = await registerAttachment(
      repo,
      store,
      "h-1",
      "pay-1",
      "att-1",
      "p-1",
      "comprovante.pdf",
    )

    expect(att.id).toBe("att-1")
    expect(att.householdId).toBe("h-1")
    expect(att.paymentId).toBe("pay-1")
    expect(att.uploadedBy).toBe("p-1")
    expect(att.nomeOriginal).toBe("comprovante.pdf")
    // tamanho e tipo vêm do R2, não do que o cliente declarou.
    expect(att.tamanhoBytes).toBe(48_000)
    expect(att.tipoMime).toBe("application/pdf")
    expect(await repo.listarAttachments("h-1", "pay-1")).toHaveLength(1)
  })

  it("test_chave_e_derivada_no_nucleo_nao_vem_da_borda", async () => {
    const repo = fakeAttachmentRepo()
    const store = fakeAttachmentStore([objeto({ chave: "h-9/pay-7/att-3" })])
    const att = await registerAttachment(
      repo,
      store,
      "h-9",
      "pay-7",
      "att-3",
      "p-2",
      "comprovante.pdf",
    )
    expect(att.chaveR2).toBe("h-9/pay-7/att-3")
  })

  it("test_upload_ausente_lanca_e_nao_persiste", async () => {
    const repo = fakeAttachmentRepo()
    const store = fakeAttachmentStore([]) // nada subido nessa chave

    await expect(
      registerAttachment(repo, store, "h-1", "pay-1", "att-1", "p-1", "comprovante.pdf"),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)

    expect(await repo.listarAttachments("h-1", "pay-1")).toHaveLength(0)
  })

  it("test_bytes_reais_grandes_demais_lanca_mesmo_com_nome_inocente", async () => {
    const repo = fakeAttachmentRepo()
    // O cliente subiu um arquivo de 26 MB; o teto é enforçado sobre os bytes reais.
    const store = fakeAttachmentStore([objeto({ tamanhoBytes: 26 * 1024 * 1024 })])

    await expect(
      registerAttachment(repo, store, "h-1", "pay-1", "att-1", "p-1", "comprovante.pdf"),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)

    expect(await repo.listarAttachments("h-1", "pay-1")).toHaveLength(0)
  })

  it("test_tipo_real_nao_suportado_lanca", async () => {
    const repo = fakeAttachmentRepo()
    const store = fakeAttachmentStore([objeto({ tipoMime: "text/csv" })])
    await expect(
      registerAttachment(repo, store, "h-1", "pay-1", "att-1", "p-1", "planilha.csv"),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)
  })
})
