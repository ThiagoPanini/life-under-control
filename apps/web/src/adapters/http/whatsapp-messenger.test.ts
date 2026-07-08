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

  it("test_enviar_template_monta_components_body_com_params_em_ordem", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
    }))
    vi.stubGlobal("fetch", fetchMock)

    const messenger = httpWhatsappMessenger({
      phoneNumberId: "123456",
      accessToken: "token-secreto",
    })
    const entregue = await messenger.enviarTemplate("5511987654321", {
      nome: "digest_vencimentos",
      idioma: "pt_BR",
      params: ["Luz ≈ R$ 110", "nenhuma", "≈ R$ 110"],
    })

    expect(entregue).toBe(true)
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init?.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "5511987654321",
      type: "template",
      template: {
        name: "digest_vencimentos",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Luz ≈ R$ 110" },
              { type: "text", text: "nenhuma" },
              { type: "text", text: "≈ R$ 110" },
            ],
          },
        ],
      },
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

  it("test_enviar_template_devolve_false_quando_a_meta_recusa", async () => {
    // digest precisa saber que falhou (para não reivindicar o dedup, #160)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400 })),
    )
    const messenger = httpWhatsappMessenger({ phoneNumberId: "123456", accessToken: "token" })

    const entregue = await messenger.enviarTemplate("5511987654321", {
      nome: "digest_vencimentos",
      idioma: "pt_BR",
      params: ["a", "b", "c"],
    })

    expect(entregue).toBe(false)
  })

  it("test_enviar_template_devolve_false_em_erro_de_rede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede fora do ar")
      }),
    )
    const messenger = httpWhatsappMessenger({ phoneNumberId: "123456", accessToken: "token" })

    const entregue = await messenger.enviarTemplate("5511987654321", {
      nome: "digest_vencimentos",
      idioma: "pt_BR",
      params: ["a", "b", "c"],
    })

    expect(entregue).toBe(false)
  })
})
