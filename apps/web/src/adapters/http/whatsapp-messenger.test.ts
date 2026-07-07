import { afterEach, describe, expect, it, vi } from "vitest"
import { httpWhatsappMessenger } from "./whatsapp-messenger"

/** Seam 2 fina: contra um `fetch` mockado — sem rede real (issue #155). */
describe("httpWhatsappMessenger (Seam 2 — fetch mockado)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("test_enviar_texto_chama_graph_api_com_payload_e_token_corretos", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
    }))
    vi.stubGlobal("fetch", fetchMock)

    const messenger = httpWhatsappMessenger({
      phoneNumberId: "123456",
      accessToken: "token-secreto",
    })
    await messenger.enviarTexto("5511987654321", "oi")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/123456/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-secreto",
          "Content-Type": "application/json",
        }),
      }),
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init?.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "5511987654321",
      type: "text",
      text: { body: "oi" },
    })
  })

  it("test_resposta_nao_ok_nao_lanca", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401 })),
    )

    const messenger = httpWhatsappMessenger({ phoneNumberId: "123456", accessToken: "token" })

    await expect(messenger.enviarTexto("5511987654321", "oi")).resolves.not.toThrow()
  })

  it("test_erro_de_rede_nao_lanca", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede fora do ar")
      }),
    )

    const messenger = httpWhatsappMessenger({ phoneNumberId: "123456", accessToken: "token" })

    await expect(messenger.enviarTexto("5511987654321", "oi")).resolves.not.toThrow()
  })
})
