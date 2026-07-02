import type { ImageFetcher } from "@/core/ports/image-fetcher"

/**
 * `mirrorAvatar` roda dentro de `events.signIn` (ADR — auth.ts), que o Auth.js
 * aguarda antes de fechar o redirect do OAuth: sem teto, uma foto lenta trava
 * o login inteiro. 10s é folga generosa pra uma imagem de perfil pequena.
 */
const TIMEOUT_MS = 10_000

/**
 * Adapter do `ImageFetcher` sobre o `fetch` nativo — baixa a `picture` do
 * Google no login (#51). Nunca lança: rede fora do ar, timeout, status não-OK
 * ou corpo vazio viram `null`, e o use-case (`mirrorAvatar`) trata isso como
 * "sem foto".
 */
export const httpImageFetcher: ImageFetcher = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0) return null

    return { bytes, tipoMime: res.headers.get("content-type") ?? "application/octet-stream" }
  } catch {
    return null
  }
}
