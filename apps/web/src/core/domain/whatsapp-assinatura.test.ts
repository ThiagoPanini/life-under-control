import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { assinaturaValida } from "./whatsapp-assinatura"

/** Seam 0: verificação pura da assinatura HMAC-SHA256 do webhook (issue #155). */
describe("assinaturaValida", () => {
  const appSecret = "segredo-do-app-meta"
  const corpoBruto = '{"object":"whatsapp_business_account","entry":[]}'

  function assinar(corpo: string, secret: string): string {
    return `sha256=${createHmac("sha256", secret).update(corpo).digest("hex")}`
  }

  it("test_assinatura_valida_e_aceita", () => {
    const header = assinar(corpoBruto, appSecret)

    expect(assinaturaValida(corpoBruto, header, appSecret)).toBe(true)
  })

  it("test_assinatura_com_secret_errado_e_rejeitada", () => {
    const header = assinar(corpoBruto, "secret-errado")

    expect(assinaturaValida(corpoBruto, header, appSecret)).toBe(false)
  })

  it("test_corpo_alterado_depois_de_assinado_e_rejeitado", () => {
    const header = assinar(corpoBruto, appSecret)

    expect(assinaturaValida(`${corpoBruto} `, header, appSecret)).toBe(false)
  })

  it("test_header_sem_prefixo_sha256_e_rejeitado", () => {
    const digestSemPrefixo = createHmac("sha256", appSecret).update(corpoBruto).digest("hex")

    expect(assinaturaValida(corpoBruto, digestSemPrefixo, appSecret)).toBe(false)
  })

  it("test_header_nulo_e_rejeitado", () => {
    expect(assinaturaValida(corpoBruto, null, appSecret)).toBe(false)
  })

  it("test_header_vazio_e_rejeitado", () => {
    expect(assinaturaValida(corpoBruto, "", appSecret)).toBe(false)
  })

  it("test_digest_de_tamanho_diferente_e_rejeitado_sem_lancar", () => {
    expect(() => assinaturaValida(corpoBruto, "sha256=abcd", appSecret)).not.toThrow()
    expect(assinaturaValida(corpoBruto, "sha256=abcd", appSecret)).toBe(false)
  })
})
