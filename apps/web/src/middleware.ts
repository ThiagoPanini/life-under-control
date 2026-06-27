import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { gateRedirect } from "@/core/use-cases/gate"

// A porta (ADR-0004): sem sessão → login; logado mirando a porta/landing → Painel.
export default auth((req) => {
  const destino = gateRedirect({
    isLoggedIn: Boolean(req.auth),
    pathname: req.nextUrl.pathname,
  })
  if (destino && destino !== req.nextUrl.pathname) {
    return NextResponse.redirect(new URL(destino, req.nextUrl))
  }
  return NextResponse.next()
})

export const config = {
  // Tudo, menos estáticos do Next e arquivos com extensão (imagens, fontes…).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
}
