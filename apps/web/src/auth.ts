import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { drizzleUserRepo } from "@/adapters/db/user-repo.drizzle"
import { httpImageFetcher } from "@/adapters/http/image-fetcher"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { SESSION_MAX_AGE_SEGUNDOS } from "@/core/domain/access"
import { canSignIn } from "@/core/use-cases/can-sign-in"
import { mirrorAvatar } from "@/core/use-cases/mirror-avatar"

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
  events: {
    // Efeito colateral do login (#51), nunca o gate: `events` não influencia o
    // retorno do `signIn` acima — falha aqui (rede, R2) jamais barra o acesso.
    async signIn({ user }) {
      if (!user.email) return
      try {
        await mirrorAvatar(
          drizzleUserRepo(),
          r2AttachmentStore(),
          httpImageFetcher,
          user.email,
          user.image,
        )
      } catch (err) {
        console.error("[auth] falha ao espelhar avatar:", err)
      }
    },
  },
})
