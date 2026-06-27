/**
 * Acesso ao Lar (núcleo puro — ADR-0004). A autorização é a allowlist (config),
 * separada da identidade/autoria (tabela `users`, ADR-0002). Aqui só há regra
 * pura: parse da allowlist e checagem de e-mail. Nada de Auth.js nem rede.
 */

/**
 * Quebra a config `LUC_ALLOWLIST` ("a@x, b@y") em e-mails normalizados e únicos.
 * Deduplica (após trim/lowercase) pra que `a@x, A@x` conte como 1 Pessoa, não 2
 * — senão o check de "exatamente 2" (invariante #2) passaria com 1 identidade.
 */
export function parseAllowlist(raw: string | null | undefined): string[] {
  const emails = (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(emails)]
}

/** O e-mail está na allowlist? Comparação case-insensitive, ignorando espaços. */
export function emailNaAllowlist(email: string | null | undefined, allowlist: string[]): boolean {
  if (!email) return false
  return allowlist.includes(email.trim().toLowerCase())
}
