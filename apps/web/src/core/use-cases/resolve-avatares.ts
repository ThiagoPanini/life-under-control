import type { Pessoa } from "../domain/household"
import type { AttachmentStore } from "../ports/attachment-store"

/** Uma Pessoa com a URL assinada do avatar já resolvida (`null` sem foto). */
export type PessoaComAvatar = Pessoa & { avatarUrl: string | null }

/**
 * Use-case: resolve a URL assinada de leitura do avatar de cada Pessoa
 * (`avatarKey` → `urlDeLeitura`, ADR-0008). A assinatura é pura (HMAC local,
 * sem rede) e expira em 5min — chamar de novo a cada render server-side, sem
 * cache. Borda chama isto onde vai renderizar foto; nunca o store direto.
 */
export async function resolveAvatares(
  pessoas: Pessoa[],
  store: AttachmentStore,
): Promise<PessoaComAvatar[]> {
  return Promise.all(
    pessoas.map(async (pessoa) => ({
      ...pessoa,
      avatarUrl: pessoa.avatarKey ? await store.urlDeLeitura(pessoa.avatarKey) : null,
    })),
  )
}
