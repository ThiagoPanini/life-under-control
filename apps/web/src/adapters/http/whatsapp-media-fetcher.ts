import type { MidiaBaixada, WhatsappMediaFetcher } from "@/core/ports/whatsapp-media-fetcher"

const GRAPH_API_VERSION = "v21.0"
const TIMEOUT_MS = 10_000

type Config = { accessToken: string }

/**
 * Adapter do `WhatsappMediaFetcher` sobre a Graph API (ADR-0012, issue #158).
 * Dois passos: resolve o **media ID** (`GET /{mediaId}` → JSON com uma URL
 * efêmera) e baixa os bytes dessa URL — ambos autenticados com o access token.
 *
 * Anti-SSRF: a URL dos bytes vem da **resposta autenticada da Graph API** (host
 * `graph.facebook.com`/`lookaside`), nunca do corpo do webhook (público). O
 * único dado da borda usado aqui é o `mediaId`, que só endereça um lookup na
 * Graph — jamais uma URL arbitrária a seguir. Nunca lança: falha vira `null`.
 */
export function httpWhatsappMediaFetcher({ accessToken }: Config): WhatsappMediaFetcher {
  const auth = { Authorization: `Bearer ${accessToken}` }

  return {
    async baixar(mediaId: string): Promise<MidiaBaixada | null> {
      try {
        const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
          headers: auth,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!metaRes.ok) {
          console.error(`whatsapp: lookup de mídia falhou com status ${metaRes.status}`)
          return null
        }
        const meta = (await metaRes.json()) as { url?: unknown; mime_type?: unknown }
        if (typeof meta.url !== "string") {
          console.error("whatsapp: resposta de mídia sem URL")
          return null
        }

        const bin = await fetch(meta.url, {
          headers: auth,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!bin.ok) {
          console.error(`whatsapp: download de mídia falhou com status ${bin.status}`)
          return null
        }
        const conteudo = new Uint8Array(await bin.arrayBuffer())
        const tipoMime =
          typeof meta.mime_type === "string"
            ? meta.mime_type
            : (bin.headers.get("content-type") ?? "application/octet-stream")
        return { conteudo, tipoMime }
      } catch (e) {
        console.error("whatsapp: download de mídia falhou", e)
        return null
      }
    },
  }
}
