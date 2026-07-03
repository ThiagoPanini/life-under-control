import { S3Client } from "@aws-sdk/client-s3"
import { describe, expect, it } from "vitest"
import { r2AttachmentStore, r2ClientConfig } from "./r2-attachment-store"

/**
 * Teste fino do adapter R2 — assina com credencial **sintética**, sem rede e sem
 * R2 real (o ADR-0008 dispensa integração contra o R2 no CI). A assinatura SigV4
 * é pura: confere que as URLs assinadas embutem a chave, a expiração e a
 * assinatura, que upload e leitura usam métodos distintos (PUT vs GET) e que o PUT
 * **não** carrega checksum (que quebraria o upload do navegador). Usa a mesma
 * `r2ClientConfig` da produção, então o guard de checksum é fiel.
 */
function clienteSintetico(): S3Client {
  return new S3Client(r2ClientConfig("conta-fake", "fake-key", "fake-secret"))
}

describe("r2AttachmentStore (assinatura, sem rede)", () => {
  it("test_endpoint_local_usa_path_style_sem_alterar_o_port", () => {
    expect(
      r2ClientConfig("conta-fake", "fake-key", "fake-secret", "http://127.0.0.1:9000"),
    ).toMatchObject({
      endpoint: "http://127.0.0.1:9000",
      forcePathStyle: true,
    })
  })

  it("test_url_de_upload_assina_put_com_a_chave_e_expiracao", async () => {
    const store = r2AttachmentStore(clienteSintetico(), "bucket-teste")

    const url = await store.urlDeUpload("h-1/pay-1/att-1", "application/pdf")

    expect(url).toContain("/h-1/pay-1/att-1")
    expect(url).toContain("X-Amz-Signature=")
    expect(url).toContain("X-Amz-Expires=300")
    // Guard de regressão: nenhum checksum assinado — senão o `fetch` PUT do
    // navegador (sem esses headers) seria rejeitado pelo R2 e o upload falharia.
    expect(url.toLowerCase()).not.toContain("checksum")
  })

  it("test_url_de_leitura_assina_a_mesma_chave", async () => {
    const store = r2AttachmentStore(clienteSintetico(), "bucket-teste")

    const url = await store.urlDeLeitura("h-1/pay-1/att-1")

    expect(url).toContain("/h-1/pay-1/att-1")
    expect(url).toContain("X-Amz-Signature=")
  })

  it("test_upload_e_leitura_assinam_metodos_distintos", async () => {
    const store = r2AttachmentStore(clienteSintetico(), "bucket-teste")

    const up = await store.urlDeUpload("h-1/pay-1/att-1", "image/png")
    const get = await store.urlDeLeitura("h-1/pay-1/att-1")

    // A assinatura difere por método (PUT ≠ GET), então as URLs não colidem.
    expect(up).not.toBe(get)
  })
})
