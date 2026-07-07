import type { MidiaBaixada, WhatsappMediaFetcher } from "@/core/ports/whatsapp-media-fetcher"

export type WhatsappMediaFetcherFake = WhatsappMediaFetcher & {
  /** Os media IDs pedidos, em ordem — inspecionável pelo teste. */
  pedidos: string[]
}

/**
 * Fake do download de mídia: mapeia `mediaId → bytes`. ID desconhecido devolve
 * `null` (simula mídia sumida/URL expirada) — o caminho de degradação do use-case.
 */
export function fakeWhatsappMediaFetcher(
  midiaPorId: Record<string, MidiaBaixada> = {},
): WhatsappMediaFetcherFake {
  const pedidos: string[] = []

  return {
    pedidos,
    async baixar(mediaId) {
      pedidos.push(mediaId)
      return midiaPorId[mediaId] ?? null
    },
  }
}
