import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { SESSION_MAX_AGE_SEGUNDOS } from "@/core/domain/access"
import { canSignIn } from "@/core/use-cases/can-sign-in"

/**
 * Auth.js v5 (ADR-0004): Google + sessão JWT. O callback `signIn` aplica a
 * allowlist pós-OAuth — falha-fechado se a config estiver inválida. `trustHost`
 * porque rodamos atrás do proxy (Traefik/Cloudflare). `maxAge` explícito fixa o
 * tempo de vida da sessão (política, não default implícito da lib — ver `access.ts`).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
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
    signIn({ user }) {
      try {
        return canSignIn(user.email, process.env.LUC_ALLOWLIST)
      } catch (err) {
        console.error("[auth] allowlist inválida — negando acesso:", err)
        return false
      }
    },
  },
})
