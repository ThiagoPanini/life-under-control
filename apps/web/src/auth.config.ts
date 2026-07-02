import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import { SESSION_MAX_AGE_SEGUNDOS } from "@/core/domain/access"
import { canSignIn } from "@/core/use-cases/can-sign-in"

/**
 * Config edge-safe do Auth.js v5 (ADR-0004): só o que o middleware precisa e que
 * roda no edge runtime — providers, sessão, páginas e o gate de allowlist (puro).
 * NADA de adapter Node aqui (Drizzle/pg, aws-sdk/crypto do R2): o `middleware.ts`
 * importa este módulo pro bundle edge, e o edge runtime não suporta `crypto`. Os
 * efeitos colaterais Node-only do login (espelhar avatar, #51) moram só no
 * `auth.ts`, que roda em Node — route handler, server actions, server components.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEGUNDOS },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    // Allowlist pós-OAuth (ADR-0004): falha-fechado se a config estiver inválida.
    signIn({ user }) {
      try {
        return canSignIn(user.email, process.env.LUC_ALLOWLIST)
      } catch (err) {
        console.error("[auth] allowlist inválida — negando acesso:", err)
        return false
      }
    },
  },
} satisfies NextAuthConfig
