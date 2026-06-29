import { describe, expect, it } from "vitest"
import type { AttachmentBruto } from "@/core/domain/attachment"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { AttachmentInvalidoError, prepareAttachmentUpload } from "./prepare-attachment-upload"

function brutoValido(over: Partial<AttachmentBruto> = {}): AttachmentBruto {
  return {
    nomeOriginal: "comprovante.pdf",
    tipoMime: "application/pdf",
    tamanhoBytes: 48_000,
    ...over,
  }
}

describe("prepareAttachmentUpload (Seam 1)", () => {
  it("test_prepara_deriva_chave_escopada_e_assina_o_upload", async () => {
    const store = fakeAttachmentStore()

    const out = await prepareAttachmentUpload(store, "h-1", "pay-1", "att-1", brutoValido())

    expect(out.attachmentId).toBe("att-1")
    // chave = {lar}/{lançamento}/{anexo} — o escopo do Lar prefixa tudo (#1).
    expect(out.chaveR2).toBe("h-1/pay-1/att-1")
    expect(out.uploadUrl).toContain(encodeURIComponent("h-1/pay-1/att-1"))
  })

  it("test_prepara_nao_persiste_nada", async () => {
    const store = fakeAttachmentStore()
    await prepareAttachmentUpload(store, "h-1", "pay-1", "att-1", brutoValido())
    // Assinar o upload não materializa o objeto — o navegador é quem sobe os bytes.
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_tipo_nao_suportado_lanca_e_nao_assina", async () => {
    const store = fakeAttachmentStore()
    await expect(
      prepareAttachmentUpload(
        store,
        "h-1",
        "pay-1",
        "att-1",
        brutoValido({ tipoMime: "text/csv" }),
      ),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)
  })

  it("test_arquivo_grande_demais_lanca", async () => {
    const store = fakeAttachmentStore()
    await expect(
      prepareAttachmentUpload(
        store,
        "h-1",
        "pay-1",
        "att-1",
        brutoValido({ tamanhoBytes: 26 * 1024 * 1024 }),
      ),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)
  })

  it("test_imagem_e_aceita", async () => {
    const store = fakeAttachmentStore()
    const out = await prepareAttachmentUpload(
      store,
      "h-1",
      "pay-1",
      "att-9",
      brutoValido({ nomeOriginal: "foto.jpg", tipoMime: "image/jpeg" }),
    )
    expect(out.uploadUrl).toContain(encodeURIComponent("image/jpeg"))
  })
})
