import type { AttachmentStore } from "@/core/ports/attachment-store"

/** Um objeto "no bucket" do fake — a chave e os metadados reais que o R2 devolveria. */
export type ObjetoFake = { chave: string; tamanhoBytes: number; tipoMime: string }

/** Fake do `AttachmentStore` com inspeção do "bucket" — para os testes do Seam 1. */
export type FakeAttachmentStore = AttachmentStore & {
  /** As chaves "no bucket" — o teste afirma que `remover` apagou. */
  chaves(): string[]
}

/**
 * Fake do `AttachmentStore` para o Seam 1 — assina URLs sintéticas (sem rede) e
 * mantém um Map dos objetos "no bucket". Assinar o upload **não** materializa o
 * objeto (na vida real o navegador é quem sobe os bytes); por isso os testes que
 * dependem do objeto existir (registrar, remover) o semeiam explicitamente.
 */
export function fakeAttachmentStore(seed: ObjetoFake[] = []): FakeAttachmentStore {
  const bucket = new Map<string, { tamanhoBytes: number; tipoMime: string }>(
    seed.map((o) => [o.chave, { tamanhoBytes: o.tamanhoBytes, tipoMime: o.tipoMime }]),
  )

  return {
    async urlDeUpload(chave, tipoMime) {
      return `https://r2.fake/put/${encodeURIComponent(chave)}#${encodeURIComponent(tipoMime)}`
    },
    async enviar(chave, conteudo, tipoMime) {
      // O put server-side materializa o objeto: metadados passam a achá-lo, com o
      // tamanho real dos bytes — espelha o que o R2 devolveria num HEAD depois.
      bucket.set(chave, { tamanhoBytes: conteudo.byteLength, tipoMime })
    },
    async urlDeLeitura(chave) {
      return `https://r2.fake/get/${encodeURIComponent(chave)}`
    },
    async metadados(chave) {
      return bucket.get(chave) ?? null
    },
    async remover(chave) {
      bucket.delete(chave)
    },
    chaves: () => [...bucket.keys()],
  }
}
