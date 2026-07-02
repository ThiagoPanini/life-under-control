import { NextResponse } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"
import { gateRedirect } from "@/core/use-cases/gate"

// Usa SÓ a config edge-safe (`auth.config`): o `auth.ts` completo arrastaria os
// adapters Node (R2/aws-sdk→crypto, Drizzle/pg) pro bundle edge e quebraria o
// middleware em runtime ("edge runtime does not support Node.js 'crypto'").
const { auth } = NextAuth(authConfig)

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
