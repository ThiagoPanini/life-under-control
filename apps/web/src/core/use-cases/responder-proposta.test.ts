import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { PaymentProposal } from "@/core/domain/payment-proposal"
import type { BillRepo } from "@/core/ports/bill-repo"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { fakeCalendar } from "./calendar.fake"
import { fakeContaMatcher } from "./conta-matcher.fake"
import { fakePaymentProposalRepo } from "./payment-proposal-repo.fake"
import { fakePaymentRepo } from "./payment-repo.fake"
import {
  type EdicaoTextoDeps,
  editarCampoTexto,
  MENSAGEM_CANCELADO,
  MENSAGEM_COMPROVANTE_INVALIDO,
  MENSAGEM_CONTA_SUMIU,
  MENSAGEM_FALTA_CONTA,
  MENSAGEM_JA_RESOLVIDA,
  MENSAGEM_MES_SEM_CONTA,
  MENSAGEM_PROPOSTA_SUMIU,
  MENSAGEM_TENTE_CONFIRMAR_DE_NOVO,
  PREFIXO_NAO_ENTENDI,
  type ResponderDeps,
  responderProposta,
  varrerPropostasExpiradas,
} from "./responder-proposta"
import { fakeWhatsappMessenger } from "./whatsapp-messenger.fake"

/**
 * Seam 1 (issues #159/#178): as respostas do casal à Proposta — Confirmar (vira
 * Lançamento com Anexo), Cancelar, o menu Alterar (Conta/Mês por lista, Valor/Data/
 * Favorecido por texto livre), a edição por texto e a expiração. Só fakes (repos,
 * store, messenger, matcher, Clock) — sem rede nem banco.
 */

const LAR = "lar-1"
const THIAGO = "u-thiago"
const REMET = "5511987654321"
const STAGING = "finance/proposals/lar-1/prop-1"

function billLuz(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-luz",
    householdId: LAR,
    nome: "Luz",
    descricao: null,
    icon: "zap",
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

function propostaSeed(over: Partial<PaymentProposal> = {}): PaymentProposal {
  return {
    id: "prop-1",
    householdId: LAR,
    waMessageId: "wamid.C1",
    bytesHash: "hash-1",
    paidBy: THIAGO,
    billId: "bill-luz",
    valorCentavos: 25343,
    dataPagamento: "2026-07-05",
    competencia: "2026-07",
    favorecido: "ENEL DISTRIBUICAO SAO PAULO",
    stagingKey: STAGING,
    tipoMime: "image/jpeg",
    estado: "proposta",
    criadoEm: "2026-07-07T12:00:00.000Z",
    aguardandoCampo: null,
    aguardandoPor: null,
    ...over,
  }
}

type Opts = {
  proposta?: Partial<PaymentProposal>
  bills?: Bill[]
  hoje?: string
  matcherIds?: string[]
  semStaging?: boolean
  /** Tamanho do objeto de staging — >25 MB força o Confirmar a rejeitar como comprovante inválido. */
  stagingBytes?: number
}

function montar(opts: Opts = {}) {
  const p = propostaSeed(opts.proposta)
  const proposalRepo = fakePaymentProposalRepo([p])
  const paymentRepo = fakePaymentRepo([])
  const attachmentRepo = fakeAttachmentRepo([])
  const bills = opts.bills ?? [billLuz()]
  const billRepo: Pick<BillRepo, "listarBills"> = {
    async listarBills() {
      return bills
    },
  }
  const store = fakeAttachmentStore(
    opts.semStaging
      ? []
      : [{ chave: p.stagingKey, tamanhoBytes: opts.stagingBytes ?? 2048, tipoMime: p.tipoMime }],
  )
  const messenger = fakeWhatsappMessenger()
  const deps: ResponderDeps = {
    proposalRepo,
    paymentRepo,
    attachmentRepo,
    billRepo,
    matcher: fakeContaMatcher(opts.matcherIds ?? bills.map((b) => b.id)),
    store,
    messenger,
    clock: { hoje: () => opts.hoje ?? "2026-07-08" },
    calendar: fakeCalendar(),
    novoId: () => "att-1",
  }
  return { deps, proposalRepo, paymentRepo, attachmentRepo, store, messenger }
}

function acao(
  over: Partial<{
    acao: string
    proposalId: string
    billId: string
    campo: string
    competencia: string
  }>,
) {
  return { householdId: LAR, remetente: REMET, pessoaId: THIAGO, acao: over as never }
}

describe("responderProposta (Seam 1)", () => {
  it("test_confirmar_cria_lancamento_com_anexo_promove_staging_e_confirma", async () => {
    const { deps, proposalRepo, paymentRepo, attachmentRepo, store, messenger } = montar()

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    const pays = await paymentRepo.listarTodosPayments(LAR)
    expect(pays).toHaveLength(1)
    expect(pays[0].billId).toBe("bill-luz")
    expect(pays[0].valor).toBe(25343)
    expect(pays[0].competencia).toBe("2026-07")
    expect(pays[0].paidBy).toBe(THIAGO)

    // Anexo nasceu na chave canônica (finance/payments/…), staging promovido e limpo.
    expect(await attachmentRepo.listarAttachments(LAR, pays[0].id)).toHaveLength(1)
    expect(store.chaves()).not.toContain(STAGING)
    expect(store.chaves().some((k) => k.startsWith(`finance/payments/${LAR}/${pays[0].id}/`))).toBe(
      true,
    )

    expect(proposalRepo.propostas[0].estado).toBe("confirmada")
    const resposta = messenger.enviados.at(-1)?.corpo ?? ""
    expect(resposta).toContain("Registrei")
    expect(resposta).toContain("Luz")
    expect(resposta).toContain("R$ 253,43")
  })

  it("test_confirmar_repetido_nao_duplica_o_lancamento", async () => {
    const { deps, paymentRepo, messenger } = montar()

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))
    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(1)
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_JA_RESOLVIDA)
  })

  it("test_confirmar_sem_conta_orienta_trocar_e_nao_cria_lancamento", async () => {
    const { deps, paymentRepo, proposalRepo, messenger } = montar({
      proposta: { billId: null, competencia: null },
    })

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(proposalRepo.propostas[0].estado).toBe("proposta")
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_FALTA_CONTA)
  })

  it("test_cancelar_nao_deixa_rastro_e_limpa_staging", async () => {
    const { deps, paymentRepo, proposalRepo, store, messenger } = montar()

    await responderProposta(deps, acao({ acao: "cancelar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(store.chaves()).not.toContain(STAGING)
    expect(proposalRepo.propostas[0].estado).toBe("cancelada")
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_CANCELADO)
  })

  it("test_alterar_abre_o_menu_com_os_cinco_campos", async () => {
    const { deps, messenger } = montar()

    await responderProposta(deps, acao({ acao: "alterar", proposalId: "prop-1" }))

    expect(messenger.listas).toHaveLength(1)
    expect(messenger.listas[0].linhas.map((l) => l.id)).toEqual([
      "campo:prop-1:conta",
      "campo:prop-1:competencia",
      "campo:prop-1:valor",
      "campo:prop-1:data",
      "campo:prop-1:favorecido",
    ])
  })

  it("test_alterar_conta_apresenta_lista_ranqueada_pelo_matcher", async () => {
    const bills = [billLuz(), billLuz({ id: "bill-agua", nome: "Água" })]
    const { deps, messenger } = montar({ bills, matcherIds: ["bill-agua", "bill-luz"] })

    await responderProposta(
      deps,
      acao({ acao: "escolher-campo", proposalId: "prop-1", campo: "conta" }),
    )

    expect(messenger.listas).toHaveLength(1)
    expect(messenger.listas[0].linhas.map((l) => l.id)).toEqual([
      "conta:prop-1:bill-agua",
      "conta:prop-1:bill-luz",
    ])
  })

  it("test_alterar_mes_lista_competencias_recentes_da_conta", async () => {
    const { deps, messenger } = montar({ hoje: "2026-07-08" })

    await responderProposta(
      deps,
      acao({ acao: "escolher-campo", proposalId: "prop-1", campo: "competencia" }),
    )

    // Conta mensal → últimas Competências, a mais recente (julho) no topo.
    const linha = messenger.listas.at(-1)?.linhas ?? []
    expect(linha[0]?.id).toBe("mes:prop-1:2026-07")
    expect(linha.map((l) => l.id)).toContain("mes:prop-1:2026-06")
  })

  it("test_alterar_mes_sem_conta_orienta_escolher_conta_antes", async () => {
    const { deps, messenger } = montar({ proposta: { billId: null } })

    await responderProposta(
      deps,
      acao({ acao: "escolher-campo", proposalId: "prop-1", campo: "competencia" }),
    )

    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_MES_SEM_CONTA)
  })

  it("test_escolher_mes_grava_competencia_e_repropoe", async () => {
    const { deps, proposalRepo, messenger } = montar()

    await responderProposta(
      deps,
      acao({ acao: "escolher-mes", proposalId: "prop-1", competencia: "2026-06" }),
    )

    expect(proposalRepo.propostas[0].competencia).toBe("2026-06")
    expect(messenger.interativos.at(-1)?.botoes.map((b) => b.titulo)).toContain("Confirmar")
  })

  it("test_alterar_valor_marca_edicao_pendente_e_pede_o_valor_com_exemplo", async () => {
    const { deps, proposalRepo, messenger } = montar()

    await responderProposta(
      deps,
      acao({ acao: "escolher-campo", proposalId: "prop-1", campo: "valor" }),
    )

    expect(proposalRepo.propostas[0].aguardandoCampo).toBe("valor")
    expect(proposalRepo.propostas[0].aguardandoPor).toBe(THIAGO)
    expect(messenger.enviados.at(-1)?.corpo).toContain("253,43")
  })

  it("test_escolher_conta_regrava_conta_reinfere_competencia_e_repropoe", async () => {
    const bills = [billLuz(), billLuz({ id: "bill-agua", nome: "Água" })]
    const { deps, proposalRepo, messenger } = montar({ bills })

    await responderProposta(
      deps,
      acao({ acao: "escolher-conta", proposalId: "prop-1", billId: "bill-agua" }),
    )

    expect(proposalRepo.propostas[0].billId).toBe("bill-agua")
    expect(proposalRepo.propostas[0].competencia).not.toBeNull()
    const repropoe = messenger.interativos.at(-1)
    expect(repropoe?.corpo).toContain("Água")
    expect(repropoe?.botoes.map((b) => b.titulo)).toContain("Confirmar")
  })

  it("test_interacao_com_proposta_expirada_carimba_e_limpa_sem_confirmar", async () => {
    // hoje > criadoEm(07-07) + 7d = 07-14 → expirou; tocar Confirmar não cria fato.
    const { deps, proposalRepo, paymentRepo, store, messenger } = montar({ hoje: "2026-07-20" })

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(proposalRepo.propostas[0].estado).toBe("expirada")
    expect(store.chaves()).not.toContain(STAGING)
    expect(messenger.enviados.at(-1)?.corpo.toLowerCase()).toContain("expirou")
  })

  it("test_proposta_inexistente_orienta_reenviar", async () => {
    const { deps, messenger } = montar()

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-fantasma" }))

    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_PROPOSTA_SUMIU)
  })

  it("test_falha_ao_criar_lancamento_mantem_proposta_aberta_e_pede_retry", async () => {
    const { deps, proposalRepo, paymentRepo, messenger } = montar()
    paymentRepo.criarPayment = async () => {
      throw new Error("postgres indisponível")
    }

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    // CAS é o commit final: se recordPayment falha, o estado nunca virou —
    // segue `proposta` (nada de confirmada sem Lançamento) e o retry é seguro.
    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(proposalRepo.propostas[0].estado).toBe("proposta")
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_TENTE_CONFIRMAR_DE_NOVO)
  })

  it("test_confirmar_conta_encerrada_orienta_e_nao_cria_lancamento", async () => {
    // A Proposta aponta pra Conta que foi encerrada depois de proposta: não se
    // lança em Conta arquivada (paridade com o portal). billLuz sai da lista ativa.
    const { deps, proposalRepo, paymentRepo, messenger } = montar({
      bills: [billLuz({ estado: "encerrada", encerradaEm: "2026-07-06" })],
    })

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(proposalRepo.propostas[0].estado).toBe("proposta")
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_CONTA_SUMIU)
  })

  it("test_falha_no_anexo_compensa_o_lancamento_sem_deixar_orfao", async () => {
    const { deps, proposalRepo, paymentRepo, store, messenger } = montar()
    // recordPayment cria o Lançamento; a promoção do comprovante falha logo depois.
    // A compensação DELETA o Lançamento recém-criado — o bug clássico (Lançamento
    // órfão que duplica no retry) não pode existir.
    store.copiar = async () => {
      throw new Error("R2 fora")
    }

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(proposalRepo.propostas[0].estado).toBe("proposta")
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_TENTE_CONFIRMAR_DE_NOVO)
  })

  it("test_comprovante_grande_demais_erro_permanente_e_compensa", async () => {
    // Bytes acima do teto (25 MB) passaram o staging mas o Confirmar revalida os
    // metadados reais na chave canônica (registerAttachment) → AttachmentInvalidoError.
    // Erro PERMANENTE: mensagem distinta (reenviar o mesmo não resolve) e sem órfão.
    const { deps, proposalRepo, paymentRepo, messenger } = montar({
      stagingBytes: 26 * 1024 * 1024,
    })

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(proposalRepo.propostas[0].estado).toBe("proposta")
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_COMPROVANTE_INVALIDO)
  })

  it("test_corrida_perdida_no_commit_desfaz_o_lancamento_e_avisa_ja_resolvida", async () => {
    const { deps, proposalRepo, paymentRepo, store, messenger } = montar()
    // Double-tap concorrente: o outro clique confirmou entre a checagem de estado e
    // o CAS aqui → confirmar() devolve null. O perdedor desfaz o que criou; só o
    // vencedor fica com o Lançamento (aqui, nenhum — simulamos só o perdedor).
    proposalRepo.confirmar = async () => null

    await responderProposta(deps, acao({ acao: "confirmar", proposalId: "prop-1" }))

    expect(await paymentRepo.listarTodosPayments(LAR)).toHaveLength(0)
    expect(store.chaves().some((k) => k.startsWith(`finance/payments/${LAR}/`))).toBe(false)
    expect(messenger.enviados.at(-1)?.corpo).toBe(MENSAGEM_JA_RESOLVIDA)
  })
})

describe("editarCampoTexto (menu Alterar por texto livre, #178)", () => {
  const entrada = (texto: string) => ({
    householdId: LAR,
    remetente: REMET,
    pessoaId: THIAGO,
    texto,
  })

  it("test_texto_edita_o_valor_quando_ha_edicao_pendente_e_repropoe", async () => {
    const { deps, proposalRepo, messenger } = montar()
    await proposalRepo.definirAguardando(LAR, "prop-1", "valor", THIAGO)

    const consumido = await editarCampoTexto(deps as EdicaoTextoDeps, entrada("300,50"))

    expect(consumido).toBe(true)
    expect(proposalRepo.propostas[0].valorCentavos).toBe(30050)
    // Edição pendente limpa e Proposta re-ofertada com botões.
    expect(proposalRepo.propostas[0].aguardandoCampo).toBeNull()
    expect(messenger.interativos.at(-1)?.corpo).toContain("R$ 300,50")
  })

  it("test_texto_edita_a_data_em_formato_br", async () => {
    const { deps, proposalRepo } = montar()
    await proposalRepo.definirAguardando(LAR, "prop-1", "data", THIAGO)

    await editarCampoTexto(deps as EdicaoTextoDeps, entrada("10/06/2026"))

    expect(proposalRepo.propostas[0].dataPagamento).toBe("2026-06-10")
  })

  it("test_texto_edita_o_favorecido_cru_aparado", async () => {
    const { deps, proposalRepo } = montar()
    await proposalRepo.definirAguardando(LAR, "prop-1", "favorecido", THIAGO)

    await editarCampoTexto(deps as EdicaoTextoDeps, entrada("  Enel SP  "))

    expect(proposalRepo.propostas[0].favorecido).toBe("Enel SP")
  })

  it("test_texto_que_nao_casa_o_formato_reprompta_e_mantem_a_edicao_pendente", async () => {
    const { deps, proposalRepo, messenger } = montar()
    await proposalRepo.definirAguardando(LAR, "prop-1", "valor", THIAGO)

    const consumido = await editarCampoTexto(deps as EdicaoTextoDeps, entrada("sei lá"))

    expect(consumido).toBe(true)
    // Não gravou lixo, seguiu esperando o valor, e o reprompt traz o exemplo.
    expect(proposalRepo.propostas[0].valorCentavos).toBe(25343)
    expect(proposalRepo.propostas[0].aguardandoCampo).toBe("valor")
    const msg = messenger.enviados.at(-1)?.corpo ?? ""
    expect(msg).toContain(PREFIXO_NAO_ENTENDI)
    expect(msg).toContain("253,43")
  })

  it("test_texto_sem_edicao_pendente_nao_consome_a_borda_ecoa", async () => {
    const { deps, messenger } = montar()

    const consumido = await editarCampoTexto(deps as EdicaoTextoDeps, entrada("oi"))

    // Nada pendente → false (a borda manda o eco de instrução); sem resposta daqui.
    expect(consumido).toBe(false)
    expect(messenger.enviados).toHaveLength(0)
    expect(messenger.interativos).toHaveLength(0)
  })
})

describe("varrerPropostasExpiradas (Seam 1)", () => {
  it("test_varredura_carimba_expirada_e_limpa_staging_das_velhas_deixa_as_novas", async () => {
    const velha = propostaSeed({
      id: "prop-velha",
      stagingKey: "finance/proposals/lar-1/prop-velha",
      criadoEm: "2026-06-01T12:00:00.000Z",
    })
    const nova = propostaSeed({
      id: "prop-nova",
      stagingKey: "finance/proposals/lar-1/prop-nova",
      criadoEm: "2026-07-07T12:00:00.000Z",
    })
    const proposalRepo = fakePaymentProposalRepo([velha, nova])
    const store = fakeAttachmentStore([
      { chave: velha.stagingKey, tamanhoBytes: 1, tipoMime: "image/jpeg" },
      { chave: nova.stagingKey, tamanhoBytes: 1, tipoMime: "image/jpeg" },
    ])

    await varrerPropostasExpiradas({ proposalRepo, store, clock: { hoje: () => "2026-07-08" } })

    expect(proposalRepo.propostas.find((p) => p.id === "prop-velha")?.estado).toBe("expirada")
    expect(proposalRepo.propostas.find((p) => p.id === "prop-nova")?.estado).toBe("proposta")
    expect(store.chaves()).not.toContain(velha.stagingKey)
    expect(store.chaves()).toContain(nova.stagingKey)
  })
})
