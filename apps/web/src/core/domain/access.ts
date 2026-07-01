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

/**
 * Tempo de vida da sessão JWT, em segundos (30 dias). Explícito de propósito:
 * o default do Auth.js já é ~30 dias, mas fixá-lo torna a política intencional
 * e imune a mudança silenciosa da lib. Este é também o teto da janela do
 * TOCTOU da allowlist (ADR-0004): como o `LUC_ALLOWLIST` só é checado no
 * callback `signIn` (time-of-check), remover uma Pessoa não revoga um JWT já
 * emitido antes deste prazo — mitigação nuclear é rotacionar `AUTH_SECRET`.
 * Aceitável no Lar de 2 Pessoas (acesso simétrico, remoção é evento raro).
 */
export const SESSION_MAX_AGE_SEGUNDOS = 30 * 24 * 60 * 60
