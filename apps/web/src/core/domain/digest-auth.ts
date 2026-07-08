import { timingSafeEqual } from "node:crypto"

const PREFIXO_BEARER = "Bearer "

/**
 * Valida o segredo do disparo do digest (#160): o header `Authorization` deve ser
 * exatamente `Bearer <esperado>`. Comparação em tempo constante (evita timing
 * attack). Fail-closed: fecha (`false`) se o esperado não está configurado —
 * nunca abre sobre segredo vazio, como o fail-closed do webhook (#155).
 */
export function segredoDigestValido(header: string | null, esperado: string | undefined): boolean {
  if (!esperado) return false
  if (!header?.startsWith(PREFIXO_BEARER)) return false

  const fornecido = Buffer.from(header.slice(PREFIXO_BEARER.length))
  const alvo = Buffer.from(esperado)
  // timingSafeEqual exige mesmo tamanho; comprimento diferente já reprova.
  if (fornecido.length !== alvo.length) return false
  return timingSafeEqual(fornecido, alvo)
}
