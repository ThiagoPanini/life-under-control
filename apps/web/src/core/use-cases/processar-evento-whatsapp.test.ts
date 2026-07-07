import { describe, expect, it } from "vitest"
import type { Bill } from "../domain/bill"
import type { Pessoa } from "../domain/household"
import type { BillRepo } from "../ports/bill-repo"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { fakeCalendar } from "./calendar.fake"
import { fakeContaMatcher } from "./conta-matcher.fake"
import { fakePaymentProposalRepo } from "./payment-proposal-repo.fake"
import { fakePaymentRepo } from "./payment-repo.fake"
import { processarEventoWhatsapp, TEXTO_INSTRUCAO_USO } from "./processar-evento-whatsapp"
import type { ComprovanteDeps } from "./propor-lancamento-comprovante"
import { fakeReceiptExtractor } from "./receipt-extractor.fake"
import { fakeUserRepo } from "./user-repo.fake"
import { fakeWhatsappEventRepo } from "./whatsapp-event-repo.fake"
import { fakeWhatsappMediaFetcher } from "./whatsapp-media-fetcher.fake"
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

function payloadComprovante(waMessageId: string, from: string, mediaId: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: waMessageId,
                  from,
                  type: "image",
                  image: { id: mediaId, mime_type: "image/jpeg" },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

const BILL_CONDO: Bill = {
  id: "bill-condo",
  householdId: "lar-1",
  nome: "Condomínio",
  descricao: null,
  icon: "building-2",
  recurrence: { intervalMonths: 1, anchorMonth: null },
  dueRule: { kind: "dia-fixo", day: 10 },
  dueMonthOffset: 0,
  primeiraCompetencia: "2026-01",
  estado: "ativa",
  encerradaEm: null,
  logoKey: null,
}

/** Bundle do pipeline do comprovante (#158) com fakes — a mídia `media-1` casa a Conta. */
function comprovanteFake(over: Partial<ComprovanteDeps> = {}): ComprovanteDeps {
  const billRepo: Pick<BillRepo, "listarBills"> = {
    async listarBills() {
      return [BILL_CONDO]
    },
  }
  return {
    mediaFetcher: fakeWhatsappMediaFetcher({
      "media-1": { conteudo: new TextEncoder().encode("bytes"), tipoMime: "image/jpeg" },
    }),
    extractor: fakeReceiptExtractor({
      valorCentavos: 123456,
      dataPagamento: "2026-07-08",
      favorecido: "Condomínio",
      vencimentoImpresso: "2026-07-10",
    }),
    matcher: fakeContaMatcher(["bill-condo"]),
    billRepo,
    paymentRepo: fakePaymentRepo([]),
    proposalRepo: fakePaymentProposalRepo(),
    store: fakeAttachmentStore(),
    messenger: fakeWhatsappMessenger(),
    clock: { hoje: () => "2026-07-20" },
    calendar: fakeCalendar(),
    novoId: () => "prop-1",
    ...over,
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

  it("test_comprovante_de_vinculado_dispara_o_pipeline_e_responde_a_proposta", async () => {
    const userRepo = fakeUserRepo([pessoa({ householdId: "lar-1" })])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    const comprovante = comprovanteFake()

    await processarEventoWhatsapp(
      { userRepo, eventRepo, messenger, comprovante: () => comprovante },
      payloadComprovante("wamid.img", "5511987654321", "media-1"),
    )

    const proposalRepo = comprovante.proposalRepo as ReturnType<typeof fakePaymentProposalRepo>
    const messengerComprovante = comprovante.messenger as ReturnType<typeof fakeWhatsappMessenger>
    expect(proposalRepo.propostas).toHaveLength(1)
    expect(proposalRepo.propostas[0].paidBy).toBe("u-thiago")
    expect(messengerComprovante.interativos).toHaveLength(1)
    // Comprovante não recebe o eco de texto.
    expect(messenger.enviados).toEqual([])
  })

  it("test_comprovante_sem_pipeline_configurado_nao_lanca", async () => {
    const userRepo = fakeUserRepo([pessoa({ householdId: "lar-1" })])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()

    await expect(
      processarEventoWhatsapp(
        { userRepo, eventRepo, messenger },
        payloadComprovante("wamid.img2", "5511987654321", "media-1"),
      ),
    ).resolves.not.toThrow()
    expect(messenger.enviados).toEqual([])
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

  it("test_falha_em_um_evento_do_lote_nao_impede_os_demais", async () => {
    const thiago = pessoa()
    const jakeline = pessoa({ id: "u-jakeline", whatsappPhone: "+5511900000002" })
    const userRepo = fakeUserRepo([thiago, jakeline])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    const enviarOriginal = messenger.enviarTexto
    messenger.enviarTexto = async (para, corpo) => {
      if (para === "5511987654321") throw new Error("graph api instável")
      return enviarOriginal(para, corpo)
    }
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.a", from: "5511987654321", type: "text", text: { body: "oi" } },
                  { id: "wamid.b", from: "5511900000002", type: "text", text: { body: "oi" } },
                ],
              },
            },
          ],
        },
      ],
    }

    await expect(
      processarEventoWhatsapp({ userRepo, eventRepo, messenger }, payload),
    ).resolves.not.toThrow()

    expect(messenger.enviados).toEqual([{ para: "5511900000002", corpo: TEXTO_INSTRUCAO_USO }])
  })

  it("test_log_e_injetavel_em_vez_de_preso_ao_console_global", async () => {
    const userRepo = fakeUserRepo([])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    const logs: string[] = []

    await processarEventoWhatsapp(
      { userRepo, eventRepo, messenger, log: (mensagem) => logs.push(mensagem) },
      payloadMensagem("wamid.log", "5511900000000", "oi"),
    )

    expect(logs).toEqual([expect.stringContaining("não vinculado a nenhuma Pessoa")])
  })
})
