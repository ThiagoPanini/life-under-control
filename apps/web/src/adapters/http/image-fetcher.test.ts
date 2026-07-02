import { afterEach, describe, expect, it, vi } from "vitest"
import { httpImageFetcher } from "./image-fetcher"

/** Seam 2 fina: contra um `fetch` mockado — sem rede real. */
describe("httpImageFetcher (Seam 2 — fetch mockado)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("test_baixa_ok_devolve_bytes_e_tipo_mime", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => bytes.buffer,
      })),
    )

    const resultado = await httpImageFetcher("https://google/foto.jpg")

    expect(resultado?.tipoMime).toBe("image/jpeg")
    expect(resultado?.bytes).toEqual(bytes)
  })

  it("test_status_nao_ok_devolve_nulo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        headers: new Headers(),
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )

    expect(await httpImageFetcher("https://google/foto.jpg")).toBeNull()
  })

  it("test_corpo_vazio_devolve_nulo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )

    expect(await httpImageFetcher("https://google/foto.jpg")).toBeNull()
  })

  it("test_erro_de_rede_devolve_nulo_nunca_lanca", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede fora do ar")
      }),
    )

    await expect(httpImageFetcher("https://google/foto.jpg")).resolves.toBeNull()
  })
})
