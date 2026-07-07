import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verificação da assinatura HMAC-SHA256 do webhook da Meta (ADR-0012, issue
 * #155). Roda sobre o corpo bruto (antes de qualquer parse) — decodificar
 * primeiro invalidaria a assinatura, que a Meta calcula sobre os bytes crus.
 */

const PREFIXO = "sha256="

/**
 * Confere o header `x-hub-signature-256` contra o HMAC-SHA256 do corpo bruto
 * com o app secret, em tempo constante. `false` para qualquer forma inválida
 * (header ausente, sem prefixo, tamanho diferente do digest) — nunca lança,
 * pra não vazar o motivo da rejeição por uma exceção com timing distinto.
 */
export function assinaturaValida(
  corpoBruto: string,
  headerAssinatura: string | null,
  appSecret: string,
): boolean {
  if (!headerAssinatura?.startsWith(PREFIXO)) return false

  const digestRecebido = Buffer.from(headerAssinatura.slice(PREFIXO.length), "hex")
  const digestEsperado = Buffer.from(
    createHmac("sha256", appSecret).update(corpoBruto).digest("hex"),
    "hex",
  )

  if (digestRecebido.length !== digestEsperado.length) return false

  return timingSafeEqual(digestRecebido, digestEsperado)
}
