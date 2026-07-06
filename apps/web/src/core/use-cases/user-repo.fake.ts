import type { Pessoa } from "@/core/domain/household"
import type { UserRepo } from "@/core/ports/user-repo"

export function fakeUserRepo(seed: Pessoa[] = []): UserRepo {
  const store = new Map<string, Pessoa>(seed.map((p) => [p.id, p]))

  return {
    async obterPorEmail(email) {
      const alvo = email.toLowerCase()
      return [...store.values()].find((p) => p.email.toLowerCase() === alvo) ?? null
    },
    async obterPorGoogleEmail(googleEmail) {
      const alvo = googleEmail.toLowerCase()
      return [...store.values()].find((p) => p.googleEmail?.toLowerCase() === alvo) ?? null
    },
    async definirAvatarKey(userId, avatarKey) {
      const pessoa = store.get(userId)
      if (!pessoa) return
      store.set(userId, { ...pessoa, avatarKey })
    },
    async vincularGoogleEmail(userId, googleEmail) {
      const pessoa = store.get(userId)
      if (!pessoa) return
      store.set(userId, { ...pessoa, googleEmail: googleEmail.toLowerCase() })
    },
    async obterPorWhatsappPhone(whatsappPhone) {
      return [...store.values()].find((p) => p.whatsappPhone === whatsappPhone) ?? null
    },
    async vincularWhatsappPhone(userId, whatsappPhone) {
      const pessoa = store.get(userId)
      if (!pessoa) return
      store.set(userId, { ...pessoa, whatsappPhone })
    },
    async desvincularWhatsappPhone(userId) {
      const pessoa = store.get(userId)
      if (!pessoa) return
      store.set(userId, { ...pessoa, whatsappPhone: null })
    },
  }
}
