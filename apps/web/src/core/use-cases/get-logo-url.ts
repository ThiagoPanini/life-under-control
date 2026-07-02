import type { AttachmentStore } from "../ports/attachment-store"

/**
 * Use-case: resgata a URL assinada de leitura do logo de uma Conta (ADR-0008,
 * ADR-0003 — a borda nunca fala com o `AttachmentStore` direto). `null` sem
 * `logoKey` — sem assinar nada; a Conta já vem escopada pelo Lar de quem a
 * carregou, então não há verificação de posse aqui.
 */
export async function getLogoUrl(
  store: AttachmentStore,
  logoKey: string | null,
): Promise<string | null> {
  if (!logoKey) return null
  return store.urlDeLeitura(logoKey)
}
