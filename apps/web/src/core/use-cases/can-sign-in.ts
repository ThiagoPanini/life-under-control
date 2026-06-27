import { emailNaAllowlist, parseAllowlist } from "../domain/access"

/** A allowlist do Lar precisa ter exatamente 2 e-mails (invariante: 2 Pessoas). */
export class AllowlistInvalidaError extends Error {
  constructor(quantidade: number) {
    super(`A allowlist precisa de exatamente 2 e-mails; encontrei ${quantidade}`)
    this.name = "AllowlistInvalidaError"
  }
}

/**
 * Decide se um e-mail pós-OAuth pode entrar (ADR-0004). Lança se a allowlist
 * não tem exatamente 2 e-mails — quem chama (callback signIn) falha-fechado.
 */
export function canSignIn(
  email: string | null | undefined,
  rawAllowlist: string | null | undefined,
): boolean {
  const allowlist = parseAllowlist(rawAllowlist)
  if (allowlist.length !== 2) throw new AllowlistInvalidaError(allowlist.length)
  return emailNaAllowlist(email, allowlist)
}
