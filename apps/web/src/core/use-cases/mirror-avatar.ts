import { chaveAvatar } from "../domain/household"
import type { AttachmentStore } from "../ports/attachment-store"
import type { ImageFetcher } from "../ports/image-fetcher"
import type { UserRepo } from "../ports/user-repo"

/**
 * Use-case: espelha a foto do Google no R2 no login. Acha a Pessoa pelo e-mail,
 * baixa a `picture` e grava no bucket sob uma chave fixa por Pessoa, então seta
 * `avatarKey`. Nunca lança e nunca bloqueia o login: sem `pictureUrl`, e-mail
 * desconhecido, falha no download ou erro no R2 — o use-case simplesmente não
 * toca `avatarKey`, que fica como estava (nulo na 1ª vez → fallback inicial+hue).
 */
export async function mirrorAvatar(
  userRepo: UserRepo,
  attachmentStore: AttachmentStore,
  fetchImage: ImageFetcher,
  email: string,
  pictureUrl: string | null | undefined,
): Promise<void> {
  if (!pictureUrl) return

  const pessoa = await userRepo.obterPorEmail(email)
  if (!pessoa) return

  const baixada = await fetchImage(pictureUrl)
  if (!baixada) return

  const chave = chaveAvatar(pessoa.id)
  try {
    await attachmentStore.enviar(chave, baixada.bytes, baixada.tipoMime)
    await userRepo.definirAvatarKey(pessoa.id, chave)
  } catch {
    return // erro no R2 ou ao gravar avatarKey não derruba o login — Pessoa fica sem foto até o próximo
  }
}
