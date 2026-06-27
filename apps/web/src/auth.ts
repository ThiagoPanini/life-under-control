import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { canSignIn } from "@/core/use-cases/can-sign-in"

/**
 * Auth.js v5 (ADR-0004): Google + sessão JWT. O callback `signIn` aplica a
 * allowlist pós-OAuth — falha-fechado se a config estiver inválida. `trustHost`
 * porque rodamos atrás do proxy (Traefik/Cloudflare).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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
