import { describe, expect, it } from "vitest"
import { classificarEventoWebhook } from "./whatsapp-evento"

/** Seam 0: classificação pura do payload do webhook (issue #155) — roteia sem quebrar em formato inesperado. */
describe("classificarEventoWebhook", () => {
  it("test_mensagem_de_texto_classifica_como_mensagem", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [
                  {
                    id: "wamid.ABC123",
                    from: "5511987654321",
                    type: "text",
                    text: { body: "oi" },
                  },
                ],
              },
            },
          ],
        },
      ],
    }

    expect(classificarEventoWebhook(payload)).toEqual([
      { tipo: "mensagem", waMessageId: "wamid.ABC123", remetente: "5511987654321", texto: "oi" },
    ])
  })

  it("test_mensagem_nao_texto_classifica_como_mensagem_com_texto_nulo", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: "wamid.IMG", from: "5511987654321", type: "image" }],
              },
            },
          ],
        },
      ],
    }

    expect(classificarEventoWebhook(payload)).toEqual([
      { tipo: "mensagem", waMessageId: "wamid.IMG", remetente: "5511987654321", texto: null },
    ])
  })

  it("test_status_update_classifica_como_status", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: "wamid.ST1", status: "delivered", recipient_id: "5511987654321" }],
              },
            },
          ],
        },
      ],
    }

    expect(classificarEventoWebhook(payload)).toEqual([{ tipo: "status" }])
  })

  it("test_template_status_update_classifica_como_template", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: { message_template_status_update: { event: "approved" } },
            },
          ],
        },
      ],
    }

    expect(classificarEventoWebhook(payload)).toEqual([{ tipo: "template" }])
  })

  it("test_payload_desconhecido_nao_lanca_e_classifica_como_desconhecido", () => {
    expect(classificarEventoWebhook({ algo: "inesperado" })).toEqual([{ tipo: "desconhecido" }])
  })

  it("test_payload_nulo_ou_malformado_nao_lanca", () => {
    expect(classificarEventoWebhook(null)).toEqual([{ tipo: "desconhecido" }])
    expect(classificarEventoWebhook(undefined)).toEqual([{ tipo: "desconhecido" }])
    expect(classificarEventoWebhook("string qualquer")).toEqual([{ tipo: "desconhecido" }])
  })

  it("test_multiplas_mensagens_no_mesmo_payload_classificam_todas", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.1", from: "5511900000001", type: "text", text: { body: "a" } },
                  { id: "wamid.2", from: "5511900000002", type: "text", text: { body: "b" } },
                ],
              },
            },
          ],
        },
      ],
    }

    expect(classificarEventoWebhook(payload)).toEqual([
      { tipo: "mensagem", waMessageId: "wamid.1", remetente: "5511900000001", texto: "a" },
      { tipo: "mensagem", waMessageId: "wamid.2", remetente: "5511900000002", texto: "b" },
    ])
  })
})
