/**
 * Prefixos públicos: a porta (login) e as rotas do Auth.js. Exceções pontuais
 * pro webhook do WhatsApp (ADR-0012, issue #155) — a Meta chama sem sessão, quem
 * autentica aquela borda é a assinatura HMAC — e pro disparo do digest (#160),
 * chamado pela scheduled task do Coolify e autenticado por segredo dedicado, não
 * pelo Auth.js. Entradas no nível da rota (não `/api/webhooks` ou `/api/cron`
 * inteiros): `isPublic` casa o caminho exato **e o que estiver sob ele**, então
 * uma rota nova em outro ponto do namespace não herda a isenção sem querer —
 * precisa da própria entrada aqui.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/webhooks/whatsapp",
  "/api/cron/digest-vencimentos",
]

/** Opt-in local para validar a UI sem transportar credenciais/allowlist de produção. */
export function localAuthBypass(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return nodeEnv === "development" && flag === "true"
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Decisão pura da porta (ADR-0004): para onde redirecionar, ou `null` se a rota
 * pode seguir. Sem sessão, tudo que não é público vai pro login; com sessão, a
 * porta/landing manda pro Painel.
 */
export function gateRedirect(params: { isLoggedIn: boolean; pathname: string }): string | null {
  const { isLoggedIn, pathname } = params

  if (isLoggedIn) {
    if (pathname === "/login" || pathname === "/") return "/painel"
    return null
  }

  if (isPublic(pathname)) return null
  return "/login"
}
