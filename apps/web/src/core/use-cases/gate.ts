/**
 * Prefixos públicos: a porta (login) e as rotas do Auth.js. Exceção pontual
 * pro webhook do WhatsApp (ADR-0012, issue #155) — a Meta chama sem sessão
 * nenhuma; quem autentica aquela borda é a assinatura HMAC, não o Auth.js.
 * Caminho exato (não `/api/webhooks` inteiro): um webhook futuro nesse
 * namespace não herda a isenção sem querer — precisa da própria entrada aqui.
 */
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/webhooks/whatsapp"]

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
