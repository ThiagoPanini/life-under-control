import { describe, expect, it } from "vitest"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { AttachmentInvalidoError } from "./prepare-attachment-upload"
import { prepareLogoUpload } from "./prepare-logo-upload"

describe("prepareLogoUpload (Seam 1)", () => {
  it("test_prepara_deriva_chave_por_upload_e_assina_o_upload", async () => {
    const store = fakeAttachmentStore()
    const out = await prepareLogoUpload(store, "h-1", "bill-1", "up-1", "image/png", 48_000)
    expect(out.chaveR2).toBe("finance/bills/h-1/bill-1/up-1")
    expect(out.uploadUrl).toContain(encodeURIComponent("finance/bills/h-1/bill-1/up-1"))
  })

  it("test_uploads_distintos_da_mesma_conta_derivam_chaves_distintas", async () => {
    const store = fakeAttachmentStore()
    const primeiro = await prepareLogoUpload(store, "h-1", "bill-1", "up-1", "image/png", 48_000)
    const segundo = await prepareLogoUpload(store, "h-1", "bill-1", "up-2", "image/png", 48_000)
    // trocar o logo assina um objeto novo — o antigo não é sobrescrito até a confirmação.
    expect(primeiro.chaveR2).not.toBe(segundo.chaveR2)
  })

  it("test_prepara_nao_persiste_nada", async () => {
    const store = fakeAttachmentStore()
    await prepareLogoUpload(store, "h-1", "bill-1", "up-1", "image/png", 48_000)
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_pdf_e_rejeitado_para_logo", async () => {
    const store = fakeAttachmentStore()
    await expect(
      prepareLogoUpload(store, "h-1", "bill-1", "up-1", "application/pdf", 48_000),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)
  })

  it("test_svg_e_rejeitado_para_logo", async () => {
    const store = fakeAttachmentStore()
    await expect(
      prepareLogoUpload(store, "h-1", "bill-1", "up-1", "image/svg+xml", 4_000),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)
  })

  it("test_arquivo_grande_demais_lanca", async () => {
    const store = fakeAttachmentStore()
    await expect(
      prepareLogoUpload(store, "h-1", "bill-1", "up-1", "image/jpeg", 26 * 1024 * 1024),
    ).rejects.toBeInstanceOf(AttachmentInvalidoError)
  })

  it("test_imagem_valida_e_aceita", async () => {
    const store = fakeAttachmentStore()
    const out = await prepareLogoUpload(store, "h-1", "bill-9", "up-1", "image/jpeg", 20_000)
    expect(out.uploadUrl).toContain(encodeURIComponent("image/jpeg"))
  })
})
