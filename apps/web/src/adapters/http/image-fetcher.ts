import type { ImageFetcher } from "@/core/ports/image-fetcher"

/**
 * Adapter do `ImageFetcher` sobre o `fetch` nativo — baixa a `picture` do
 * Google no login (#51). Nunca lança: rede fora do ar, status não-OK ou corpo
 * vazio viram `null`, e o use-case (`mirrorAvatar`) trata isso como "sem foto".
 */
export const httpImageFetcher: ImageFetcher = async (url) => {
  try {
    const res = await fetch(url)
    if (!res.ok) return null

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0) return null

    return { bytes, tipoMime: res.headers.get("content-type") ?? "application/octet-stream" }
  } catch {
    return null
  }
}
