import { describe, expect, it } from "vitest"
import type { Bill } from "../domain/bill"
import type { Pessoa } from "../domain/household"
import type { PaymentProposal } from "../domain/payment-proposal"
import type { BillRepo } from "../ports/bill-repo"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { fakeCalendar } from "./calendar.fake"
import { fakeContaMatcher } from "./conta-matcher.fake"
import { fakePaymentProposalRepo } from "./payment-proposal-repo.fake"
import { fakePaymentRepo } from "./payment-repo.fake"
import { processarEventoWhatsapp, TEXTO_INSTRUCAO_USO } from "./processar-evento-whatsapp"
import { type ComprovanteDeps, TEXTO_TENTE_DE_NOVO } from "./propor-lancamento-comprovante"
import { fakeReceiptExtractor } from "./receipt-extractor.fake"
import type { ResponderDeps } from "./responder-proposta"
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

function payloadInteracao(waMessageId: string, from: string, replyId: string) {
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
                  type: "interactive",
                  interactive: { type: "button_reply", button_reply: { id: replyId, title: "x" } },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

function proposta159(): PaymentProposal {
  return {
    id: "prop-1",
    householdId: "lar-1",
    waMessageId: "wamid.orig",
    bytesHash: "hash-1",
    paidBy: "u-thiago",
    billId: "bill-condo",
    valorCentavos: 12000,
    dataPagamento: "2026-07-05",
    competencia: "2026-07",
    favorecido: "Condomínio",
    stagingKey: "finance/proposals/lar-1/prop-1",
    tipoMime: "image/jpeg",
    estado: "proposta",
    criadoEm: "2026-07-07T12:00:00.000Z",
  }
}

/** Bundle de resposta aos botões (#159) com fakes — o Lar `lar-1`, a Conta `bill-condo`. */
function responderFake(proposalRepo: ReturnType<typeof fakePaymentProposalRepo>): ResponderDeps {
  const billRepo: Pick<BillRepo, "listarBills"> = {
    async listarBills() {
      return [BILL_CONDO]
    },
  }
  return {
    proposalRepo,
    paymentRepo: fakePaymentRepo([]),
    attachmentRepo: fakeAttachmentRepo([]),
    billRepo,
    matcher: fakeContaMatcher(["bill-condo"]),
    store: fakeAttachmentStore([
      { chave: "finance/proposals/lar-1/prop-1", tamanhoBytes: 1, tipoMime: "image/jpeg" },
    ]),
    messenger: fakeWhatsappMessenger(),
    clock: { hoje: () => "2026-07-08" },
    calendar: fakeCalendar(),
    novoId: () => "att-1",
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

  it("test_botao_de_vinculado_roteia_pro_responder_e_encerra_a_proposta", async () => {
    const userRepo = fakeUserRepo([pessoa({ householdId: "lar-1" })])
    const eventRepo = fakeWhatsappEventRepo()
    const proposalRepo = fakePaymentProposalRepo([proposta159()])
    const responder = responderFake(proposalRepo)

    await processarEventoWhatsapp(
      { userRepo, eventRepo, messenger: fakeWhatsappMessenger(), responder: () => responder },
      payloadInteracao("wamid.btn", "5511987654321", "cancelar:prop-1"),
    )

    expect(proposalRepo.propostas[0].estado).toBe("cancelada")
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

  it("test_webhook_so_de_status_nao_dispara_a_varredura", async () => {
    // A Meta dispara `status` (sent/delivered/read) a cada mensagem que o bot manda,
    // em alta frequência: não pode virar um SELECT de limpeza. Sem tráfego humano, sem varredura.
    const userRepo = fakeUserRepo([pessoa()])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    let varreu = false
    const varredura = () => {
      varreu = true
      return {
        proposalRepo: fakePaymentProposalRepo(),
        store: fakeAttachmentStore(),
        clock: { hoje: () => "2026-07-08" },
      }
    }
    const payloadStatus = {
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.st2", status: "read" }] } }] }],
    }

    await processarEventoWhatsapp({ userRepo, eventRepo, messenger, varredura }, payloadStatus)

    expect(varreu).toBe(false)
  })

  it("test_webhook_com_mensagem_dispara_a_varredura_oportunista", async () => {
    const userRepo = fakeUserRepo([pessoa()])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    let varreu = false
    const varredura = () => {
      varreu = true
      return {
        proposalRepo: fakePaymentProposalRepo(),
        store: fakeAttachmentStore(),
        clock: { hoje: () => "2026-07-08" },
      }
    }

    await processarEventoWhatsapp(
      { userRepo, eventRepo, messenger, varredura },
      payloadMensagem("wamid.sw", "5511987654321", "oi"),
    )

    expect(varreu).toBe(true)
  })

  it("test_comprovante_que_estoura_no_pipeline_responde_tente_de_novo", async () => {
    // O evento já foi reivindicado (a Meta não reenvia): um throw fora dos caminhos
    // que já degradam (aqui, o repo de Proposta fora) não pode deixar o casal no vácuo.
    const userRepo = fakeUserRepo([pessoa({ householdId: "lar-1" })])
    const eventRepo = fakeWhatsappEventRepo()
    const messenger = fakeWhatsappMessenger()
    const comprovante = comprovanteFake()
    comprovante.proposalRepo.obterAtivaPorHash = async () => {
      throw new Error("postgres fora")
    }

    await processarEventoWhatsapp(
      { userRepo, eventRepo, messenger, comprovante: () => comprovante },
      payloadComprovante("wamid.err", "5511987654321", "media-1"),
    )

    // A rede de segurança é da borda: responde pelo messenger externo, não o do bundle.
    expect(messenger.enviados.at(-1)?.corpo).toBe(TEXTO_TENTE_DE_NOVO)
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
