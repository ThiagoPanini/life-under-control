import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { PaymentProposal } from "@/core/domain/payment-proposal"
import type { ReciboWhatsapp } from "@/core/domain/recibo-whatsapp"
import type { BillRepo } from "@/core/ports/bill-repo"
import {
  type PaymentProposalRepo,
  PropostaDuplicadaError,
} from "@/core/ports/payment-proposal-repo"
import type { ReceiptExtractor } from "@/core/ports/receipt-extractor"
import type { MidiaBaixada } from "@/core/ports/whatsapp-media-fetcher"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { fakeCalendar } from "./calendar.fake"
import { fakeContaMatcher } from "./conta-matcher.fake"
import { fakePaymentProposalRepo } from "./payment-proposal-repo.fake"
import { fakePaymentRepo } from "./payment-repo.fake"
import {
  type ComprovanteEntrada,
  proporLancamentoComprovante,
  TEXTO_TENTE_DE_NOVO,
  TEXTO_TIPO_NAO_SUPORTADO,
} from "./propor-lancamento-comprovante"
import { fakeReceiptExtractor } from "./receipt-extractor.fake"
import { fakeWhatsappMediaFetcher } from "./whatsapp-media-fetcher.fake"
import { fakeWhatsappMessenger } from "./whatsapp-messenger.fake"

/**
 * Seam 1 (issue #158): o pipeline que transforma um comprovante do WhatsApp numa
 * Proposta de Lançamento respondida no chat com botões. Testado só com fakes
 * (mediaFetcher, extractor, matcher, repos, store, messenger, Clock) — sem rede
 * nem banco. O casamento de Conta é o `ContaMatcher` (LLM) fakeado (issue #177).
 */

const LAR = "lar-1"
const THIAGO = "u-thiago"

function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-condo",
    householdId: LAR,
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
    ...over,
  }
}

function payment(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay-seed",
    householdId: LAR,
    billId: "bill-condo",
    valor: 120000,
    dataPagamento: "2026-06-08",
    competencia: "2026-06",
    paidBy: THIAGO,
    ...over,
  }
}

function midia(bytes = "bytes-do-comprovante", tipoMime = "image/jpeg"): MidiaBaixada {
  return { conteudo: new TextEncoder().encode(bytes), tipoMime }
}

function reciboCompleto(over: Partial<ReciboWhatsapp> = {}): Partial<ReciboWhatsapp> {
  return {
    valorCentavos: 123456,
    dataPagamento: "2026-07-08",
    favorecido: "Condomínio",
    vencimentoImpresso: "2026-07-10",
    mesReferenciaImpresso: null,
    ...over,
  }
}

function entrada(over: Partial<ComprovanteEntrada> = {}): ComprovanteEntrada {
  return {
    householdId: LAR,
    paidBy: THIAGO,
    remetente: "5511987654321",
    waMessageId: "wamid.C1",
    midia: { mediaId: "media-1", tipoMime: "image/jpeg" },
    ...over,
  }
}

type Opts = {
  bills?: Bill[]
  payments?: Payment[]
  recibo?: Partial<ReciboWhatsapp>
  extractor?: ReceiptExtractor
  midiaPorId?: Record<string, MidiaBaixada>
  /** Ordenação de billIds que o matcher (fake) devolve; default = ids das Contas na ordem dada. */
  matcherIds?: string[]
}

function montar(opts: Opts = {}) {
  const proposalRepo = fakePaymentProposalRepo()
  const messenger = fakeWhatsappMessenger()
  const store = fakeAttachmentStore()
  const mediaFetcher = fakeWhatsappMediaFetcher(opts.midiaPorId ?? { "media-1": midia() })
  const billRepo: Pick<BillRepo, "listarBills"> = {
    async listarBills() {
      return opts.bills ?? [bill()]
    },
  }
  const deps = {
    mediaFetcher,
    extractor: opts.extractor ?? fakeReceiptExtractor(opts.recibo ?? reciboCompleto()),
    matcher: fakeContaMatcher(opts.matcherIds ?? (opts.bills ?? [bill()]).map((b) => b.id)),
    billRepo,
    paymentRepo: fakePaymentRepo(opts.payments ?? []),
    proposalRepo,
    store,
    messenger,
    clock: { hoje: () => "2026-07-20" },
    calendar: fakeCalendar(),
    novoId: () => "prop-1",
  }
  return { deps, proposalRepo, messenger, store, mediaFetcher }
}

describe("proporLancamentoComprovante (Seam 1)", () => {
  it("test_comprovante_de_vinculado_responde_com_conta_valor_data_competencia_e_botoes", async () => {
    const { deps, proposalRepo, messenger } = montar()

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas).toHaveLength(1)
    const p = proposalRepo.propostas[0]
    expect(p.billId).toBe("bill-condo")
    expect(p.valorCentavos).toBe(123456)
    expect(p.competencia).toBe("2026-07")
    expect(p.paidBy).toBe(THIAGO)

    expect(messenger.interativos).toHaveLength(1)
    const resposta = messenger.interativos[0]
    expect(resposta.para).toBe("5511987654321")
    expect(resposta.corpo).toContain("Condomínio")
    expect(resposta.corpo).toContain("R$ 1.234,56")
    expect(resposta.corpo).toContain("08/07/2026")
    expect(resposta.corpo).toContain("Julho/2026")
    expect(resposta.botoes.map((b) => b.titulo)).toEqual(["Confirmar", "Trocar Conta", "Cancelar"])
    expect(resposta.botoes[0].id).toBe("confirmar:prop-1")
  })

  it("test_mídia_estacionada_no_storage_em_chave_de_staging", async () => {
    const { deps, proposalRepo, store } = montar()

    await proporLancamentoComprovante(deps, entrada())

    const p = proposalRepo.propostas[0]
    expect(p.stagingKey).toBe("finance/proposals/lar-1/prop-1")
    expect(await store.metadados("finance/proposals/lar-1/prop-1")).not.toBeNull()
  })

  it("test_matcher_casa_por_semantica_mesmo_sem_nome_parecido", async () => {
    // O caso que quebrou no teste real: o favorecido legal ("ENEL DISTRIBUICAO
    // SAO PAULO") não parece com o apelido da Conta ("Luz"). O matcher LLM liga
    // os dois por conhecimento de mundo — similaridade de string devolvia 0.
    const { deps, proposalRepo } = montar({
      bills: [bill({ id: "bill-luz", nome: "Luz" })],
      recibo: reciboCompleto({ favorecido: "ENEL DISTRIBUICAO SAO PAULO" }),
      matcherIds: ["bill-luz"],
    })

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas[0].billId).toBe("bill-luz")
  })

  it("test_matcher_abstem_deixa_conta_em_branco_com_trocar_conta", async () => {
    // Nenhuma Conta plausível → o matcher devolve vazio; a Proposta nasce com a
    // Conta em branco (sem palpite) e o botão pra escolher na mão.
    const { deps, proposalRepo, messenger } = montar({
      bills: [bill({ id: "bill-luz", nome: "Luz" })],
      recibo: reciboCompleto({ favorecido: "LOJA XPTO LTDA" }),
      matcherIds: [],
    })

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas[0].billId).toBeNull()
    expect(proposalRepo.propostas[0].competencia).toBeNull()
    expect(messenger.interativos[0].botoes.some((b) => b.titulo === "Trocar Conta")).toBe(true)
  })

  it("test_favorecido_ambiguo_propoe_o_top_e_deixa_trocar_conta", async () => {
    const bills = [bill({ id: "bill-a", nome: "Energia" }), bill({ id: "bill-b", nome: "Energia" })]
    const { deps, proposalRepo, messenger } = montar({
      bills,
      recibo: reciboCompleto({ favorecido: "Energia" }),
    })

    await proporLancamentoComprovante(deps, entrada())

    // O matcher devolve a ordenação; propõe o topo, sem escolha silenciosa.
    expect(proposalRepo.propostas[0].billId).toBe("bill-a")
    expect(messenger.interativos[0].botoes.some((b) => b.titulo === "Trocar Conta")).toBe(true)
  })

  it("test_baixa_fracionada_mesma_conta_e_competencia_com_arquivo_distinto_cria_proposta", async () => {
    // Já há um Lançamento na competência que o recibo casa — baixa fracionada é
    // legítima: arquivo distinto (hash distinto) não é repetição, propõe normal.
    const { deps, proposalRepo } = montar({
      payments: [payment({ competencia: "2026-07" })],
    })

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas).toHaveLength(1)
    expect(proposalRepo.propostas[0].billId).toBe("bill-condo")
  })

  it("test_vencimento_ilegivel_ainda_infere_competencia", async () => {
    const { deps, proposalRepo } = montar({
      recibo: reciboCompleto({ vencimentoImpresso: null }),
    })

    await proporLancamentoComprovante(deps, entrada())

    // Sem vencimento impresso, cai na ocorrência em aberto mais antiga (não nula).
    expect(proposalRepo.propostas[0].competencia).not.toBeNull()
  })

  it("test_comprovante_repetido_avisa_referenciando_o_existente_e_nao_duplica", async () => {
    const { deps, proposalRepo, messenger } = montar()

    // 1º envio cria a Proposta; 2º envio do MESMO arquivo (mesmo hash) só avisa.
    await proporLancamentoComprovante(deps, entrada({ waMessageId: "wamid.C1" }))
    await proporLancamentoComprovante(deps, entrada({ waMessageId: "wamid.C2" }))

    expect(proposalRepo.propostas).toHaveLength(1)
    expect(messenger.interativos).toHaveLength(1)
    expect(messenger.enviados).toHaveLength(1)
    expect(messenger.enviados[0].corpo.toLowerCase()).toContain("já")
  })

  it("test_campo_ilegivel_vai_em_branco_sinalizado_nunca_palpite", async () => {
    const { deps, proposalRepo, messenger } = montar({
      recibo: {
        valorCentavos: null,
        dataPagamento: null,
        favorecido: null,
        vencimentoImpresso: null,
      },
    })

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas[0].valorCentavos).toBeNull()
    expect(messenger.interativos[0].corpo).toContain("não consegui ler")
  })

  it("test_extrator_fora_responde_tente_de_novo_sem_criar_proposta", async () => {
    const { deps, proposalRepo, messenger, store } = montar({
      extractor: async () => {
        throw new Error("bedrock indisponível")
      },
    })

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas).toHaveLength(0)
    expect(messenger.enviados).toEqual([{ para: "5511987654321", corpo: TEXTO_TENTE_DE_NOVO }])
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_midia_indisponivel_responde_tente_de_novo_sem_extrair", async () => {
    const { deps, proposalRepo, messenger, mediaFetcher } = montar({ midiaPorId: {} })

    await proporLancamentoComprovante(deps, entrada())

    expect(mediaFetcher.pedidos).toEqual(["media-1"])
    expect(proposalRepo.propostas).toHaveLength(0)
    expect(messenger.enviados).toEqual([{ para: "5511987654321", corpo: TEXTO_TENTE_DE_NOVO }])
  })

  it("test_tipo_de_arquivo_nao_suportado_pede_outro_formato_sem_extrair", async () => {
    // Erro PERMANENTE (não transitório): HEIC passa o "image/*" genérico mas o
    // extrator não lê — insistir no mesmo nunca resolveria.
    const { deps, proposalRepo, messenger, store } = montar({
      midiaPorId: { "media-1": midia("bytes", "image/heic") },
    })

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas).toHaveLength(0)
    expect(messenger.enviados).toEqual([{ para: "5511987654321", corpo: TEXTO_TIPO_NAO_SUPORTADO }])
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_falha_ao_persistir_responde_tente_de_novo_e_limpa_staging_orfao", async () => {
    // R2 subiu mas o banco caiu ao gravar a Proposta: o comprovante não some em
    // silêncio — pede reenvio e o staging órfão é removido.
    const { deps, proposalRepo, messenger, store } = montar()
    proposalRepo.criar = async () => {
      throw new Error("postgres indisponível")
    }

    await proporLancamentoComprovante(deps, entrada())

    expect(proposalRepo.propostas).toHaveLength(0)
    expect(messenger.enviados).toEqual([{ para: "5511987654321", corpo: TEXTO_TENTE_DE_NOVO }])
    // O staging foi limpo — nada de objeto órfão no bucket.
    expect(await store.metadados("finance/proposals/lar-1/prop-1")).toBeNull()
  })

  it("test_corrida_do_mesmo_arquivo_avisa_referenciando_sem_duplicar", async () => {
    // A pré-checagem passa (obterAtivaPorHash null), mas entre ela e o insert
    // outra entrega do mesmo arquivo gravou → o índice único faz `criar` lançar
    // PropostaDuplicadaError; a borda avisa referenciando a existente, não duplica.
    const messenger = fakeWhatsappMessenger()
    const store = fakeAttachmentStore()
    const jaExistente = {
      id: "prop-outra",
      householdId: LAR,
      estado: "proposta",
      bytesHash: "x",
    } as PaymentProposal
    let preCheck = true
    const proposalRepo: PaymentProposalRepo = {
      async criar() {
        throw new PropostaDuplicadaError("x")
      },
      async obterAtivaPorHash() {
        if (preCheck) {
          preCheck = false
          return null
        }
        return jaExistente
      },
    }
    const deps = {
      mediaFetcher: fakeWhatsappMediaFetcher({ "media-1": midia() }),
      extractor: fakeReceiptExtractor(reciboCompleto()),
      matcher: fakeContaMatcher(["bill-condo"]),
      billRepo: {
        async listarBills() {
          return [bill()]
        },
      } as Pick<BillRepo, "listarBills">,
      paymentRepo: fakePaymentRepo([]),
      proposalRepo,
      store,
      messenger,
      clock: { hoje: () => "2026-07-20" },
      calendar: fakeCalendar(),
      novoId: () => "prop-1",
    }

    await proporLancamentoComprovante(deps, entrada())

    expect(messenger.interativos).toHaveLength(0)
    expect(messenger.enviados).toHaveLength(1)
    expect(messenger.enviados[0].corpo.toLowerCase()).toContain("já")
    // Staging da tentativa perdida foi limpo.
    expect(await store.metadados("finance/proposals/lar-1/prop-1")).toBeNull()
  })
})
