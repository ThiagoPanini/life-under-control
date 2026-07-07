/**
 * Máscara progressiva de exibição enquanto o usuário digita — puramente
 * cosmética (borda). A validação/normalização real de submit continua em
 * `normalizarTelefoneE164` (core/domain/telefone.ts), que já aceita entrada
 * com ou sem esta máscara.
 */
export function mascararTelefoneEnquantoDigita(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11)

  if (digitos.length === 0) return ""
  if (digitos.length <= 2) return `(${digitos}`
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
}

/** Formata o E.164 persistido (`+55DDNNNNNNNNN`) pro formato que a Pessoa reconhece como seu. */
export function formatarTelefoneParaExibicao(e164: string): string {
  const semDdi = e164.startsWith("+55") ? e164.slice(3) : e164
  return mascararTelefoneEnquantoDigita(semDdi)
}
