import { randomUUID } from "node:crypto"
import { chaveComprovante } from "../domain/attachment"
import { type Bill, descreverMesPorExtenso, formatarDataBr } from "../domain/bill"
import { formatBRL, parseCentavos } from "../domain/money"
import { parseDataBrParaIso } from "../domain/parse-data-br"
import { descreverCompetencia, type Payment } from "../domain/payment"
import {
  type AcaoProposta,
  botoesDaProposta,
  type CampoEditavel,
  estaExpirada,
  formatarLancamentoCriado,
  formatarPropostaMensagem,
  linhasCamposProposta,
  linhasCompetenciasProposta,
  linhasContasProposta,
  mensagemCampoNaoEntendido,
  mensagemPropostaExpirada,
  type PaymentProposal,
  promptEdicaoCampo,
  type ResumoProposta,
  TITULO_LISTA_MESES,
  TITULO_MENU_ALTERAR,
} from "../domain/payment-proposal"
import type { AttachmentRepo } from "../ports/attachment-repo"
import type { AttachmentStore } from "../ports/attachment-store"
import type { BillRepo } from "../ports/bill-repo"
import type { Calendar } from "../ports/calendar"
import type { Clock } from "../ports/clock"
import type { ContaMatcher } from "../ports/conta-matcher"
import type { PaymentProposalRepo } from "../ports/payment-proposal-repo"
import type { PaymentRepo } from "../ports/payment-repo"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"
import { mesDe, ocorrenciasRecentes } from "./derive-bill-card"
import { inferirCompetenciaRecibo } from "./inferir-competencia-recibo"
import { AttachmentInvalidoError } from "./prepare-attachment-upload"
import { removerStagingSeguro } from "./propor-lancamento-comprovante"
import { recordPayment } from "./record-payment"
import { registerAttachment } from "./register-attachment"

/**
 * As respostas do casal a uma Proposta de Lançamento (#159/#178): os botões
 * Confirmar / **Alterar** / Cancelar, o menu Alterar (edita todo campo coletado) e
 * a edição por lista (Conta/Mês) ou texto livre (Valor/Data/Favorecido). Roda
 * **pós-resposta** ao webhook (ADR-0012), sobre a Proposta já persistida (#158).
 * **Confirmar** é o único caminho que vira fato: cria o Lançamento (reusando
 * `recordPayment`) e promove o comprovante do staging à chave canônica (Anexo
 * idêntico ao do portal). Cancelar/expirar não deixam efeito no domínio.
 *
 * O menu Alterar (#178) introduz **estado de conversa por remetente**: ao pedir um
 * campo de texto, a Proposta guarda `aguardando{Campo,Por}` e a próxima mensagem de
 * texto da Pessoa é lida só como aquele campo (`editarCampoTexto`, chamado da borda).
 *
 * Expiração é **derivada do relógio** (`criadoEm + TTL`, invariante #3): o estado
 * `expirada` persistido é carimbo do ato de limpeza. Dois caminhos, sem job novo:
 * lazy (interação tardia aqui) e a varredura oportunista (`varrerPropostasExpiradas`).
 */

/** A Proposta sumiu (id de botão de uma Proposta que não existe mais) — orienta reenviar. */
export const MENSAGEM_PROPOSTA_SUMIU =
  "Não achei essa Proposta — talvez já tenha sido resolvida ou expirada. Manda o comprovante de novo. 🔁"
/** Clique num botão de Proposta que já saiu do estado aberto (confirmada/cancelada/expirada). */
export const MENSAGEM_JA_RESOLVIDA = "Essa Proposta já foi resolvida. 👍"
/** Confirmar sem Conta casada: força o Alterar → Conta antes (sem Conta não há onde lançar). */
export const MENSAGEM_FALTA_CONTA =
  "Antes de confirmar, toque *Alterar* → *Conta* pra eu saber em qual Conta lançar. 🙏"
/** Confirmar com valor/data/competência ilegível: não cria Lançamento inválido (ADR-0013). */
export const MENSAGEM_FALTA_DADO =
  "Faltou ler algum dado do comprovante. Toque *Alterar* pra completar, por favor. 🙏"
/** Falha transitória ao criar o Lançamento (banco/R2) — pede retry; a Proposta segue aberta, o retry é seguro. */
export const MENSAGEM_TENTE_CONFIRMAR_DE_NOVO =
  "Não consegui registrar agora. Toque *Confirmar* de novo daqui a pouco. 🙏"
/** Erro PERMANENTE ao registrar o comprovante (arquivo grande demais/inválido) — reenviar não resolve. */
export const MENSAGEM_COMPROVANTE_INVALIDO =
  "Esse comprovante não pôde ser registrado (arquivo grande demais ou inválido). Manda um mais leve, por favor. 📎"
/** Cancelamento: nada foi registrado. */
export const MENSAGEM_CANCELADO = "Cancelado — não registrei nada. 👍"
/** Alterar → Conta sem nenhuma Conta ativa pra oferecer. */
export const MENSAGEM_SEM_CONTAS = "Você ainda não tem Contas ativas pra escolher."
/** Escolha de uma Conta que não existe/está inativa. */
export const MENSAGEM_CONTA_SUMIU = "Não achei essa Conta. Toque *Alterar* → *Conta* de novo."
/** Alterar → Mês sem Conta escolhida: a Competência depende da recorrência da Conta. */
export const MENSAGEM_MES_SEM_CONTA =
  "Escolhe a Conta primeiro (*Alterar* → *Conta*) — a Competência depende dela. 🙏"
/** Cabeçalho da lista de Conta (Alterar → Conta). */
export const TITULO_LISTA_CONTAS = "Qual é a Conta certa?"
/** Nenhum mês pra oferecer (Conta que só começa no futuro) — não manda lista vazia (a Graph API recusa). */
export const MENSAGEM_SEM_MESES =
  "Não achei Competências pra escolher nessa Conta. Confere a Conta em *Alterar* → *Conta*. 🙏"

/** Rótulo do botão que abre cada lista interativa (#178) — varia por contexto, nunca fixo. */
export const BOTAO_ESCOLHER_CAMPO = "Escolher campo"
export const BOTAO_ESCOLHER_CONTA = "Escolher Conta"
export const BOTAO_ESCOLHER_MES = "Escolher mês"

/** Teto de linhas de uma lista interativa da Graph API. */
const MAX_LINHAS_LISTA = 10
/** Quantas Competências recentes oferecer no Alterar → Mês (cabe no teto da lista). */
const QTD_MESES_OFERECIDOS = 6
/** Teto do favorecido editado à mão (rótulo de casamento, não exibido) — evita texto gigante. */
const MAX_FAVORECIDO = 120

export type ResponderDeps = {
  proposalRepo: PaymentProposalRepo
  paymentRepo: PaymentRepo
  attachmentRepo: AttachmentRepo
  billRepo: Pick<BillRepo, "listarBills">
  matcher: ContaMatcher
  store: AttachmentStore
  messenger: WhatsappMessenger
  clock: Clock
  calendar: Calendar
  /** Gera o id do Anexo — injetável pro teste ser determinístico. */
  novoId?: () => string
  log?: (mensagem: string) => void
}

/** Uma resposta do casal a uma Proposta, com a Pessoa e o Lar já resolvidos pela borda. */
export type InteracaoEntrada = {
  householdId: string
  remetente: string
  /** A Pessoa que tocou o botão (id) — dona da edição pendente do menu Alterar (#178). */
  pessoaId: string
  acao: AcaoProposta
}

/** Nome de exibição do comprovante no Anexo (cosmético) — o tipo dita a extensão. */
function nomeComprovante(proposta: PaymentProposal): string {
  const ext =
    proposta.tipoMime === "application/pdf" ? "pdf" : (proposta.tipoMime.split("/")[1] ?? "jpg")
  return `comprovante-whatsapp.${ext}`
}

/** Ordena as Contas pela ordem do ranking do matcher; as fora do ranking vão ao fim (ordem original). */
function ordenarPorRanking(bills: Bill[], ranking: string[]): Bill[] {
  const vistos = new Set<string>()
  const ordenadas: Bill[] = []
  // Ranking primeiro (dedup: um id repetido do matcher não vira linha de lista
  // duplicada, que a Graph API rejeita); as fora do ranking preservam a ordem.
  for (const id of ranking) {
    const b = bills.find((x) => x.id === id)
    if (b && !vistos.has(b.id)) {
      vistos.add(b.id)
      ordenadas.push(b)
    }
  }
  for (const b of bills) {
    if (!vistos.has(b.id)) {
      vistos.add(b.id)
      ordenadas.push(b)
    }
  }
  return ordenadas
}

export async function responderProposta(
  deps: ResponderDeps,
  entrada: InteracaoEntrada,
): Promise<void> {
  const log = deps.log ?? console.log
  const { householdId, remetente, pessoaId, acao } = entrada

  const proposta = await deps.proposalRepo.obterPorId(householdId, acao.proposalId)
  if (!proposta) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_PROPOSTA_SUMIU)
    return
  }

  // Expiração lazy: Proposta aberta e velha (createdAt+TTL < hoje) não vira fato —
  // carimba `expirada`, limpa o staging e orienta reenviar.
  if (proposta.estado === "proposta" && estaExpirada(proposta, deps.clock.hoje())) {
    await deps.proposalRepo.marcarExpirada(householdId, proposta.id)
    await removerStagingSeguro(deps.store, proposta.stagingKey, log)
    await deps.messenger.enviarTexto(remetente, mensagemPropostaExpirada())
    return
  }

  // Proposta em estado terminal (já confirmada/cancelada/expirada): nenhum botão
  // age — informa e não refaz trabalho. É a idempotência do clique repetido
  // **antes** de qualquer escrita (o CAS lá dentro cobre só a corrida concorrente).
  if (proposta.estado !== "proposta") {
    const msg = proposta.estado === "expirada" ? mensagemPropostaExpirada() : MENSAGEM_JA_RESOLVIDA
    await deps.messenger.enviarTexto(remetente, msg)
    return
  }

  switch (acao.acao) {
    case "confirmar":
      return confirmar(deps, log, proposta, remetente)
    case "cancelar":
      return cancelar(deps, log, proposta, remetente)
    case "alterar":
      return apresentarCampos(deps, proposta, remetente)
    case "escolher-campo":
      return escolherCampo(deps, log, proposta, acao.campo, remetente, pessoaId)
    case "escolher-conta":
      return trocarConta(deps, proposta, acao.billId, remetente)
    case "escolher-mes":
      return trocarMes(deps, proposta, acao.competencia, remetente)
  }
}

/** O menu Alterar (#178): a lista dos campos editáveis da Proposta. */
async function apresentarCampos(
  deps: ResponderDeps,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  await deps.messenger.enviarLista(
    remetente,
    TITULO_MENU_ALTERAR,
    linhasCamposProposta(proposta.id),
    BOTAO_ESCOLHER_CAMPO,
  )
}

/**
 * A Pessoa escolheu um campo no menu Alterar. Conta/Mês abrem uma lista; os de
 * texto livre (Valor/Data/Favorecido) marcam a edição pendente (`definirAguardando`)
 * e pedem o valor — a próxima mensagem de texto dela vira aquele campo (na borda).
 */
async function escolherCampo(
  deps: ResponderDeps,
  log: (m: string) => void,
  proposta: PaymentProposal,
  campo: CampoEditavel,
  remetente: string,
  pessoaId: string,
): Promise<void> {
  if (campo === "conta") return apresentarContas(deps, log, proposta, remetente)
  if (campo === "competencia") return apresentarMeses(deps, proposta, remetente)

  // Texto livre: marca "esperando o campo X desta Pessoa" e pede o valor com exemplo.
  const marcada = await deps.proposalRepo.definirAguardando(
    proposta.householdId,
    proposta.id,
    campo,
    pessoaId,
  )
  if (!marcada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }
  await deps.messenger.enviarTexto(remetente, promptEdicaoCampo(campo))
}

/** Alterar → Mês: lista as Competências recentes da Conta escolhida (recorrência-dependente). */
async function apresentarMeses(
  deps: ResponderDeps,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  // Só Conta **ativa** (paridade com o Confirmar/Trocar Conta): oferecer meses de
  // Conta arquivada levaria a uma edição que o Confirmar depois rejeita.
  const bill = proposta.billId
    ? (await deps.billRepo.listarBills(proposta.householdId)).find(
        (b) => b.id === proposta.billId && b.estado === "ativa",
      )
    : undefined
  if (!bill) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_MES_SEM_CONTA)
    return
  }
  const competencias = ocorrenciasRecentes(
    bill.recurrence,
    mesDe(deps.clock.hoje()),
    QTD_MESES_OFERECIDOS,
  )
    .filter((c) => c >= bill.primeiraCompetencia)
    .reverse() // a mais recente (a mais provável) no topo da lista
  // Conta que só começa no futuro → nenhuma ocorrência válida; não manda lista
  // vazia (a Graph API recusa `rows: []` e a interação estouraria).
  if (competencias.length === 0) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_SEM_MESES)
    return
  }
  const linhas = linhasCompetenciasProposta(proposta.id, competencias)
  await deps.messenger.enviarLista(remetente, TITULO_LISTA_MESES, linhas, BOTAO_ESCOLHER_MES)
}

/** Alterar → Mês → escolha: grava a Competência e re-oferece a Proposta. */
async function trocarMes(
  deps: ResponderDeps,
  proposta: PaymentProposal,
  competencia: string,
  remetente: string,
): Promise<void> {
  const atualizada = await deps.proposalRepo.atualizarCompetencia(
    proposta.householdId,
    proposta.id,
    competencia,
  )
  if (!atualizada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }
  await reofertarProposta(deps, atualizada, remetente)
}

async function confirmar(
  deps: ResponderDeps,
  log: (m: string) => void,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  const { householdId } = proposta
  // Sem Conta não há onde lançar; sem valor/data/competência o Lançamento seria
  // inválido (ADR-0013 não chuta) — orienta antes de qualquer escrita.
  if (proposta.billId == null) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_FALTA_CONTA)
    return
  }
  if (
    proposta.valorCentavos == null ||
    proposta.dataPagamento == null ||
    proposta.competencia == null
  ) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_FALTA_DADO)
    return
  }

  // Revalida a Conta ativa: a Proposta vive dias e a Conta pode ter sido encerrada
  // no meio-tempo — não se lança em Conta arquivada (paridade com o portal). Já
  // deixa o `bill` em mãos pro resumo, sem leitura pós-commit que possa falhar
  // depois do fato criado.
  const bill = (await deps.billRepo.listarBills(householdId)).find(
    (b) => b.id === proposta.billId && b.estado === "ativa",
  )
  if (!bill) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_CONTA_SUMIU)
    return
  }

  // Cria Lançamento + Anexo ANTES de comprometer o estado — o CAS é o **commit
  // final**. Falha aqui desfaz o parcial e deixa a Proposta intacta em `proposta`:
  // retry é seguro (nunca duplica, nunca fica confirmada-sem-Lançamento, nem stuck
  // se um `reabrir` falhasse). Erro PERMANENTE (comprovante inválido) não entra em
  // loop de retry — mensagem distinta.
  let payment: Payment | null = null
  let attachmentId: string | null = null
  let chaveCanonica: string | null = null
  try {
    payment = await recordPayment(deps.paymentRepo, deps.clock, householdId, bill.id, {
      valor: proposta.valorCentavos,
      dataPagamento: proposta.dataPagamento,
      competencia: proposta.competencia,
      paidBy: proposta.paidBy,
    })
    attachmentId = (deps.novoId ?? randomUUID)()
    chaveCanonica = chaveComprovante(householdId, payment.id, attachmentId)
    // Promove os bytes de staging→canônico (já estão no R2, só mudam de chave) e
    // registra o Anexo lendo o metadado real da chave canônica (honesto, #3).
    await deps.store.copiar(proposta.stagingKey, chaveCanonica)
    await registerAttachment(
      deps.attachmentRepo,
      deps.store,
      householdId,
      payment.id,
      attachmentId,
      proposta.paidBy,
      nomeComprovante(proposta),
    )
  } catch (e) {
    await compensarParcial(deps, householdId, payment, attachmentId, chaveCanonica, log)
    log(`whatsapp: falha ao criar Lançamento da Proposta ${proposta.id}: ${e}`)
    const permanente = e instanceof AttachmentInvalidoError
    await deps.messenger.enviarTexto(
      remetente,
      permanente ? MENSAGEM_COMPROVANTE_INVALIDO : MENSAGEM_TENTE_CONFIRMAR_DE_NOVO,
    )
    return
  }

  // Commit: CAS `proposta→confirmada`. Perdeu a corrida (double-tap concorrente
  // confirmou entre a checagem de estado e aqui) → desfaz o Lançamento recém-criado;
  // o vencedor já tem o dele.
  const confirmada = await deps.proposalRepo.confirmar(householdId, proposta.id)
  if (!confirmada) {
    await compensarParcial(deps, householdId, payment, attachmentId, chaveCanonica, log)
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }

  await removerStagingSeguro(deps.store, proposta.stagingKey, log)
  const resumo: ResumoProposta = {
    contaNome: bill.nome,
    valor: formatBRL(proposta.valorCentavos),
    dataPagamento: formatarDataBr(proposta.dataPagamento),
    competencia: descreverCompetencia(proposta.competencia, bill.recurrence),
  }
  await deps.messenger.enviarTexto(remetente, formatarLancamentoCriado(resumo))
}

/**
 * Desfaz um Confirmar parcial (falha antes do commit, ou corrida perdida): remove o
 * objeto canônico já copiado, o Anexo e o Lançamento já criados — na ordem inversa,
 * cada passo best-effort (nunca relança). A Proposta segue intacta em `proposta`,
 * pronta pra um novo Confirmar.
 */
async function compensarParcial(
  deps: ResponderDeps,
  householdId: string,
  payment: Payment | null,
  attachmentId: string | null,
  chaveCanonica: string | null,
  log: (m: string) => void,
): Promise<void> {
  if (chaveCanonica) await removerStagingSeguro(deps.store, chaveCanonica, log)
  if (attachmentId) {
    try {
      await deps.attachmentRepo.deletarAttachment(householdId, attachmentId)
    } catch (e) {
      log(`whatsapp: falha ao compensar Anexo ${attachmentId}: ${e}`)
    }
  }
  if (payment) {
    try {
      await deps.paymentRepo.deletarPayment(householdId, payment.id)
    } catch (e) {
      log(`whatsapp: falha ao compensar Lançamento ${payment.id}: ${e}`)
    }
  }
}

async function cancelar(
  deps: ResponderDeps,
  log: (m: string) => void,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  const cancelada = await deps.proposalRepo.cancelar(proposta.householdId, proposta.id)
  if (!cancelada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }
  await removerStagingSeguro(deps.store, proposta.stagingKey, log)
  await deps.messenger.enviarTexto(remetente, MENSAGEM_CANCELADO)
}

async function apresentarContas(
  deps: ResponderDeps,
  log: (m: string) => void,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  const ativas = (await deps.billRepo.listarBills(proposta.householdId)).filter(
    (b) => b.estado === "ativa",
  )
  if (ativas.length === 0) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_SEM_CONTAS)
    return
  }
  // Ranqueia pelo mesmo matcher LLM (#177); se ele estiver fora, lista sem ordem
  // em vez de sumir — o casal ainda escolhe na mão.
  let ranking: string[] = []
  try {
    ranking = await deps.matcher(
      proposta.favorecido,
      ativas.map((b) => ({ billId: b.id, nome: b.nome })),
    )
  } catch (e) {
    log(`whatsapp: matcher fora no Trocar Conta da Proposta ${proposta.id}: ${e}`)
  }
  // A lista interativa da Graph API tem teto rígido de 10 linhas — sem paginação
  // nativa. Com mais Contas ativas, corta no teto; o ranking do matcher lidera, então
  // a Conta certa cai no topo na esmagadora maioria. Corte silencioso não: loga o que
  // ficou de fora (o casal ainda pode dar baixa pelo portal se a Conta rara sobrar).
  if (ativas.length > MAX_LINHAS_LISTA) {
    log(
      `whatsapp: Lar com ${ativas.length} Contas ativas > ${MAX_LINHAS_LISTA} — lista truncada no Trocar Conta da Proposta ${proposta.id}`,
    )
  }
  const ordenadas = ordenarPorRanking(ativas, ranking).slice(0, MAX_LINHAS_LISTA)
  const linhas = linhasContasProposta(
    proposta.id,
    ordenadas.map((b) => ({ billId: b.id, nome: b.nome })),
  )
  await deps.messenger.enviarLista(remetente, TITULO_LISTA_CONTAS, linhas, BOTAO_ESCOLHER_CONTA)
}

async function trocarConta(
  deps: ResponderDeps,
  proposta: PaymentProposal,
  billId: string,
  remetente: string,
): Promise<void> {
  const { householdId } = proposta
  const bill = (await deps.billRepo.listarBills(householdId)).find(
    (b) => b.id === billId && b.estado === "ativa",
  )
  if (!bill) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_CONTA_SUMIU)
    return
  }

  // Re-infere a Competência pra Conta nova. Sem o vencimento impresso persistido
  // (não guardamos na Proposta), cai no fallback da ocorrência em aberto mais
  // próxima — que é o modelo "última em aberto" (decisão de 04/07).
  const payments = (await deps.paymentRepo.listarTodosPayments(householdId)).filter(
    (p) => p.billId === bill.id,
  )
  const competencia = inferirCompetenciaRecibo(
    bill,
    payments,
    deps.clock.hoje(),
    deps.calendar,
    null,
  )

  const atualizada = await deps.proposalRepo.atualizarConta(
    householdId,
    proposta.id,
    bill.id,
    competencia,
  )
  if (!atualizada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }
  // Passa o `bill` já carregado — evita reofertar re-consultar a lista de Contas.
  await reofertarProposta(deps, atualizada, remetente, bill)
}

/**
 * Re-renderiza a Proposta (resumo + botões Confirmar/Alterar/Cancelar) depois de
 * qualquer edição — o casal vê o efeito na hora e segue editando ou confirma. Deriva
 * o resumo dos campos **atuais** da Proposta. O `billConhecido` evita uma re-consulta
 * quando o chamador já tem a Conta em mãos (Trocar Conta); sem ela, busca. A
 * Competência usa a recorrência da Conta; sem Conta, cai no mês por extenso (nunca o
 * ISO cru).
 */
async function reofertarProposta(
  deps: Pick<ResponderDeps, "billRepo" | "messenger">,
  proposta: PaymentProposal,
  remetente: string,
  billConhecido?: Bill,
): Promise<void> {
  const bill =
    billConhecido ??
    (proposta.billId
      ? (await deps.billRepo.listarBills(proposta.householdId)).find(
          (b) => b.id === proposta.billId,
        )
      : undefined)
  const competenciaFmt = proposta.competencia
    ? bill
      ? descreverCompetencia(proposta.competencia, bill.recurrence)
      : descreverMesPorExtenso(proposta.competencia)
    : null
  const resumo: ResumoProposta = {
    contaNome: bill?.nome ?? null,
    valor: proposta.valorCentavos !== null ? formatBRL(proposta.valorCentavos) : null,
    dataPagamento: proposta.dataPagamento ? formatarDataBr(proposta.dataPagamento) : null,
    competencia: competenciaFmt,
  }
  await deps.messenger.enviarBotoes(
    remetente,
    formatarPropostaMensagem(resumo),
    botoesDaProposta(proposta.id),
  )
}

/** O que a edição por texto livre precisa — subconjunto leve, sem R2/Bedrock (um texto nunca falha por env de mídia). */
export type EdicaoTextoDeps = {
  proposalRepo: Pick<
    PaymentProposalRepo,
    "obterAguardandoPor" | "atualizarCampo" | "limparAguardando"
  >
  billRepo: Pick<BillRepo, "listarBills">
  messenger: WhatsappMessenger
  clock: Clock
}

/** Uma mensagem de texto do casal, com Pessoa e Lar já resolvidos pela borda. */
export type TextoEntrada = {
  householdId: string
  remetente: string
  pessoaId: string
  texto: string
}

/**
 * Interpreta uma mensagem de texto livre (#178): se a Pessoa tem uma edição pendente
 * (tocou Alterar → Valor/Data/Favorecido), lê o texto **só** como aquele campo (parser
 * determinístico), grava e re-oferece a Proposta. Parse falho → **larga** a edição
 * pendente e orienta o re-toque no menu (senão o próximo texto solto cairia de novo aqui,
 * nunca no eco — a Pessoa ficaria presa). Devolve `true` se **consumiu** o texto como
 * edição; `false` = não havia edição pendente (a borda ecoa a instrução de uso).
 */
export async function editarCampoTexto(
  deps: EdicaoTextoDeps,
  entrada: TextoEntrada,
): Promise<boolean> {
  const { householdId, remetente, pessoaId, texto } = entrada
  const proposta = await deps.proposalRepo.obterAguardandoPor(householdId, pessoaId)
  if (!proposta || proposta.aguardandoCampo == null) return false

  const campo = proposta.aguardandoCampo
  const patch = parseCampoLivre(campo, texto, deps.clock.hoje())
  if (patch === null) {
    // Fato humano é confiado, mas validado (#178): o parser é a validação. Não casou
    // o formato → larga a edição pendente e orienta o re-toque no menu. Manter a
    // pendência prenderia a Pessoa: todo texto seguinte cairia aqui, nunca no eco.
    await deps.proposalRepo.limparAguardando(householdId, pessoaId)
    await deps.messenger.enviarTexto(remetente, mensagemCampoNaoEntendido(campo))
    return true
  }

  const atualizada = await deps.proposalRepo.atualizarCampo(householdId, proposta.id, patch)
  if (!atualizada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return true
  }
  await reofertarProposta(deps, atualizada, remetente)
  return true
}

/** Lê o texto livre como o campo pedido (`valor`/`data`/`favorecido`) → patch, ou `null` se não casa o formato. */
function parseCampoLivre(
  campo: "valor" | "data" | "favorecido",
  texto: string,
  hoje: string,
): Partial<Pick<PaymentProposal, "valorCentavos" | "dataPagamento" | "favorecido">> | null {
  if (campo === "valor") {
    const centavos = parseCentavos(texto)
    return centavos !== null ? { valorCentavos: centavos } : null
  }
  if (campo === "data") {
    const iso = parseDataBrParaIso(texto, hoje)
    return iso !== null ? { dataPagamento: iso } : null
  }
  const favorecido = texto.trim()
  return favorecido !== "" ? { favorecido: favorecido.slice(0, MAX_FAVORECIDO) } : null
}

/**
 * Varredura oportunista de Propostas expiradas (#159): roda pós-resposta de
 * qualquer evento processado, sem job novo. Lista as abertas, e para cada uma que
 * o relógio já expirou carimba `expirada` e remove o staging órfão — nada de bytes
 * de Proposta velha sobrevivendo no bucket.
 */
export async function varrerPropostasExpiradas(deps: {
  proposalRepo: Pick<PaymentProposalRepo, "listarAbertas" | "marcarExpirada">
  store: Pick<AttachmentStore, "remover">
  clock: Clock
  log?: (mensagem: string) => void
}): Promise<void> {
  const log = deps.log ?? console.log
  const hoje = deps.clock.hoje()
  const abertas = await deps.proposalRepo.listarAbertas()
  for (const p of abertas) {
    if (!estaExpirada(p, hoje)) continue
    await deps.proposalRepo.marcarExpirada(p.householdId, p.id)
    await removerStagingSeguro(deps.store, p.stagingKey, log)
  }
}
