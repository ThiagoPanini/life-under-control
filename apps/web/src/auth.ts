import NextAuth from "next-auth"
import { drizzleUserRepo } from "@/adapters/db/user-repo.drizzle"
import { httpImageFetcher } from "@/adapters/http/image-fetcher"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { authConfig } from "@/auth.config"
import { mirrorAvatar } from "@/core/use-cases/mirror-avatar"

/**
 * Auth.js v5 completo, runtime Node (ADR-0004): estende a config edge-safe
 * (`auth.config` — providers, sessão JWT, allowlist) com o efeito colateral
 * Node-only do login: espelhar o avatar do Google no R2 (#51). Este módulo NÃO
 * pode ser importado pelo `middleware.ts` — arrastaria aws-sdk/crypto + Drizzle/pg
 * pro bundle edge. Consumido só por route handler, server actions e components.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
