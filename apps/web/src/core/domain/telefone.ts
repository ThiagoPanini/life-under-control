/**
 * Telefone (núcleo puro — issue #152). Normalização E.164 do WhatsApp da
 * Pessoa: sem I/O, sem Auth.js — só a regra de forma do número BR.
 */

/**
 * Normaliza um telefone BR bruto (com/sem `+55`, com máscara) pro formato
 * E.164 canônico (`+55DDNNNNNNNNN`), ou `null` se não for um número BR válido
 * (DDD de 2 dígitos + linha de 8 ou 9 dígitos). Descarta tudo que não é dígito
 * antes de validar — máscara é só decoração.
 */
export function normalizarTelefoneE164(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "")

  const semDdi =
    digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)
      ? digitos.slice(2)
      : digitos.length === 10 || digitos.length === 11
        ? digitos
        : null

  if (!semDdi) return null

  return `+55${semDdi}`
}
