import { describe, expect, it } from "vitest"
import type { Pessoa } from "../domain/household"
import { processarEventoWhatsapp, TEXTO_INSTRUCAO_USO } from "./processar-evento-whatsapp"
import { fakeUserRepo } from "./user-repo.fake"
import { fakeWhatsappEventRepo } from "./whatsapp-event-repo.fake"
import { fakeWhatsappMessenger } from "./whatsapp-messenger.fake"

/** Seam 1: processamento do evento de webhook (issue #155) contra fakes do UserRepo/EventRepo/Messenger. */
function pessoa(over: Partial<Pessoa> = {}): Pessoa {
  return {
    id: "u-thiago",
    nome: "Thiago",
    email: "thiago@casapanini.lar",
    googleEmail: null,
    hue: 211,
    inicial: "T",
    avatarKey: null,
    whatsappPhone: "+5511987654321",
    ...over,
  }
}

function payloadMensagem(waMessageId: string, from: string, texto: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: waMessageId, from, type: "text", text: { body: texto } }],
            },
          },
        ],
      },
    ],
  }
}

describe("processarEventoWhatsapp (Seam 1)", () => {
  it("test_remetente_vinculado_recebe_instrucao_de_uso", async () => {
    const thiago = pessoa()
    const userRepo = fakeUserRepo([thiago])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()

    await processarEventoWhatsapp(
      { userRepo, eventRepo, messenger },
      payloadMensagem("wamid.1", "5511987654321", "oi"),
    )

    expect(messenger.enviados).toEqual([{ para: "5511987654321", corpo: TEXTO_INSTRUCAO_USO }])
  })

  it("test_remetente_nao_vinculado_e_ignorado_em_silencio", async () => {
    const userRepo = fakeUserRepo([])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()

    await processarEventoWhatsapp(
      { userRepo, eventRepo, messenger },
      payloadMensagem("wamid.2", "5511900000000", "oi"),
    )

    expect(messenger.enviados).toEqual([])
  })

  it("test_evento_duplicado_nao_processa_duas_vezes", async () => {
    const thiago = pessoa()
    const userRepo = fakeUserRepo([thiago])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    const payload = payloadMensagem("wamid.3", "5511987654321", "oi")

    await processarEventoWhatsapp({ userRepo, eventRepo, messenger }, payload)
    await processarEventoWhatsapp({ userRepo, eventRepo, messenger }, payload)

    expect(messenger.enviados).toHaveLength(1)
  })

  it("test_evento_de_status_nao_aciona_messenger", async () => {
    const userRepo = fakeUserRepo([pessoa()])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    const payloadStatus = {
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.st", status: "delivered" }] } }] }],
    }

    await processarEventoWhatsapp({ userRepo, eventRepo, messenger }, payloadStatus)

    expect(messenger.enviados).toEqual([])
  })

  it("test_payload_desconhecido_nao_lanca_nem_aciona_messenger", async () => {
    const userRepo = fakeUserRepo([pessoa()])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()

    await expect(
      processarEventoWhatsapp({ userRepo, eventRepo, messenger }, { algo: "inesperado" }),
    ).resolves.not.toThrow()
    expect(messenger.enviados).toEqual([])
  })
})
