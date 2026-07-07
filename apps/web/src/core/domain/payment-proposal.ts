/**
 * Proposta de Lançamento (`PaymentProposal`) — núcleo puro (ADR-0003, ADR-0012,
 * CONTEXT.md). O que um comprovante do WhatsApp vira **antes** de o casal
 * confirmar: a Conta casada, o valor, a data e a Competência lidos do recibo,
 * respondidos no chat com botões. **Não é um fato** — só vira Lançamento quando
 * confirmada; cancelada ou expirada não deixa efeito no domínio (termos
 * proibidos no glossário: pré-lançamento, lançamento pendente, rascunho).
 *
 * Aqui moram só a forma de domínio, os estados, a derivação da chave de staging
 * e a composição da mensagem/botões. Nada de Drizzle, Next, rede nem SDK.
 */

import { createHash } from "node:crypto"
import { descreverMesPorExtenso, ehCompetenciaValida } from "./bill"

/**
 * Estado de vida da Proposta. `proposta` = aberta, aguardando o casal; as três
 * saídas são terminais. Só `confirmada` produz um Lançamento (o Confirmar, #159).
 */
export type EstadoProposta = "proposta" | "confirmada" | "cancelada" | "expirada"

/**
 * Estados em que uma Proposta é **ativa** para a detecção de repetido: aberta
 * (`proposta`) ou já virada Lançamento (`confirmada`). `cancelada`/`expirada`
 * são terminais e não contam — reenviar o mesmo arquivo depois de cancelar abre
 * Proposta nova. Fonte única, consumida pelo repo (query + índice único parcial).
 */
export const ESTADOS_PROPOSTA_ATIVA: EstadoProposta[] = ["proposta", "confirmada"]

/** Os dados de uma Proposta lidos do comprovante — campo `null` = ilegível, nunca palpite (ADR-0013). */
export type DadosPaymentProposal = {
  /** A mensagem do WhatsApp que originou a Proposta (auditoria/idempotência da borda). */
  waMessageId: string
  /** SHA-256 (hex) dos bytes da mídia — detecção de comprovante repetido (mesmo arquivo). */
  bytesHash: string
  /** A Pessoa que enviou o comprovante (id) — autoria, não permissão (#1). */
  paidBy: string
  /** A Conta candidata casada; `null` quando o casamento não achou candidata confiável. */
  billId: string | null
  /** Valor em centavos, BRL, inteiro > 0 (#6); `null` ilegível. */
  valorCentavos: number | null
  /** Data civil do pagamento (YYYY-MM-DD); `null` ilegível. */
  dataPagamento: string | null
  /** Competência inferida (`ano-mês`); `null` sem Conta casada ou não inferível. */
  competencia: string | null
  /** Favorecido lido do recibo (só sinal de casamento; não exibido); `null` ilegível. */
  favorecido: string | null
  /** Chave transitória dos bytes no object storage (staging), promovida no Confirmar. */
  stagingKey: string
  /** Tipo MIME da mídia baixada. */
  tipoMime: string
}

/** Uma Proposta persistida: os dados + identidade, o Lar dono, o estado e quando nasceu. */
export type PaymentProposal = DadosPaymentProposal & {
  id: string
  householdId: string
  estado: EstadoProposta
  /** Instante em que a Proposta nasceu (ISO-8601) — fato persistido. */
  criadoEm: string
  /**
   * Estado de conversa do menu Alterar (#178): o campo de texto livre que o bot
   * espera (`valor`/`data`/`favorecido`), e a Pessoa de quem espera. `null` = sem
   * edição pendente. Nasce sempre nulo (Proposta nova); só o menu Alterar o seta.
   */
  aguardandoCampo: CampoLivre | null
  aguardandoPor: string | null
}

/** Dados de uma Proposta nova já montada, mais identidade e dono (o Lar). */
export type NovaPaymentProposal = DadosPaymentProposal & { id: string; householdId: string }

/** Um botão de resposta rápida do WhatsApp: o `id` (a Pessoa não vê) e o `titulo` (o rótulo). */
export type BotaoInterativo = { id: string; titulo: string }

/**
 * Prefixo dos comprovantes ainda **sem Lançamento** no bucket compartilhado: a
 * Área (`finance`) e o estágio (`proposals`). Distinto do canônico
 * (`finance/payments/...`, `chaveComprovante`), que exige um Lançamento — a
 * Proposta ainda não tem. Namespeia por Área (ADR-0006) e não colide com o canônico.
 */
const PREFIXO_STAGING = "finance/proposals"

/**
 * Deriva a chave de staging dos bytes de um comprovante ainda em Proposta:
 * `finance/proposals/{lar}/{proposta}`. Transitória por definição — no Confirmar
 * (#159) os bytes migram para a chave canônica (`chaveComprovante`) quando o
 * Lançamento nasce e o `paymentId` passa a existir.
 */
export function chaveStaging(householdId: string, proposalId: string): string {
  return `${PREFIXO_STAGING}/${householdId}/${proposalId}`
}

/**
 * Hash (SHA-256, hex) dos bytes da mídia — a identidade do comprovante para
 * detectar reenvio do **mesmo arquivo**. É o único critério de repetição: o
 * `wa_message_id` só cobre o retry da Meta (reenvio pela Pessoa gera id novo), e
 * Conta+Competência repetida **não** é repetição (baixa fracionada é legítima —
 * 2º comprovante do mês, valor distinto, arquivo distinto → hash distinto).
 */
export function hashComprovante(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex")
}

/**
 * O aviso de comprovante repetido: o mesmo arquivo já tem Proposta aberta
 * (aguardando o casal) ou já virou Lançamento (confirmada). Referencia o
 * existente em vez de abrir uma duplicata.
 */
export function mensagemComprovanteRepetido(existente: PaymentProposal): string {
  return existente.estado === "confirmada"
    ? "Esse comprovante já virou um Lançamento aqui. 👍"
    : "Esse comprovante já está aguardando sua confirmação aqui no chat. 👆"
}

/** Ações dos botões da Proposta — o `id` do botão é `{acao}:{proposalId}` (a borda de resposta, #159, roteia por aqui). */
export const ACAO_CONFIRMAR = "confirmar"
/** O menu Alterar (#178) generaliza o antigo "Trocar Conta": edita todo campo coletado. */
export const ACAO_ALTERAR = "alterar"
/** Botão legado "Trocar Conta" de Propostas criadas antes do #178 — o parser ainda o aceita, roteando pro menu Alterar. */
export const ACAO_TROCAR = "trocar"
export const ACAO_CANCELAR = "cancelar"

/**
 * Os três botões de uma Proposta, cada um carregando o id dela na ação para o
 * webhook de resposta (#159/#178) saber sobre qual Proposta a Pessoa agiu. O botão
 * do meio abre o menu **Alterar** (#178) — a lista de campos editáveis.
 */
export function botoesDaProposta(proposalId: string): BotaoInterativo[] {
  return [
    { id: `${ACAO_CONFIRMAR}:${proposalId}`, titulo: "Confirmar" },
    { id: `${ACAO_ALTERAR}:${proposalId}`, titulo: "Alterar" },
    { id: `${ACAO_CANCELAR}:${proposalId}`, titulo: "Cancelar" },
  ]
}

/**
 * O resumo já formatado de uma Proposta para a mensagem — cada campo é o texto
 * final ou `null` (ilegível). A formatação de dinheiro (`formatBRL`, #6) e da
 * Competência (`descreverCompetencia`, recorrência-dependente) acontece no
 * use-case; aqui só se decide o layout e como sinalizar o que veio em branco.
 */
export type ResumoProposta = {
  contaNome: string | null
  valor: string | null
  dataPagamento: string | null
  competencia: string | null
}

/** Campo ilegível não vira palpite (ADR-0013): a mensagem diz que não leu, e o casal corrige. */
const ILEGIVEL = "_não consegui ler — confira no comprovante_"
const SEM_CONTA = "_não identifiquei — toque *Alterar*_"

/**
 * Compõe a mensagem da Proposta para o chat: Conta candidata, valor, data de
 * pagamento e Competência, uma por linha. Campo `null` é sinalizado em branco
 * (nunca um valor inventado); Conta ausente orienta o *Alterar*.
 */
export function formatarPropostaMensagem(resumo: ResumoProposta): string {
  return [
    "Comprovante recebido! Confira e confirme 👇",
    "",
    `*Conta:* ${resumo.contaNome ?? SEM_CONTA}`,
    `*Valor:* ${resumo.valor ?? ILEGIVEL}`,
    `*Pagamento:* ${resumo.dataPagamento ?? ILEGIVEL}`,
    `*Competência:* ${resumo.competencia ?? ILEGIVEL}`,
  ].join("\n")
}

/** Prefixo do id de uma linha da lista de Conta (Alterar → Conta): `conta:{proposalId}:{billId}`. */
export const PREFIXO_ESCOLHER_CONTA = "conta"

/** Uma linha da lista interativa do WhatsApp (menu Alterar, listas de Conta/Mês): id oculto + título visível (≤24 chars). */
export type LinhaInterativa = { id: string; titulo: string }

/**
 * As linhas da lista de Conta (Alterar → Conta, #159/#178): cada Conta candidata
 * vira uma linha cujo id carrega a Proposta e a Conta escolhida
 * (`conta:{proposalId}:{billId}`), para o webhook de resposta saber o que refazer.
 * O título é o nome da Conta, cortado no limite do WhatsApp (24 chars).
 */
export function linhasContasProposta(
  proposalId: string,
  contas: { billId: string; nome: string }[],
): LinhaInterativa[] {
  return contas.map((c) => ({
    id: `${PREFIXO_ESCOLHER_CONTA}:${proposalId}:${c.billId}`,
    titulo: cortarTitulo(c.nome),
  }))
}

/** Título de linha da lista interativa cabe em 24 chars (limite do WhatsApp). */
function cortarTitulo(texto: string): string {
  return texto.length > 24 ? `${texto.slice(0, 23)}…` : texto
}

/** Prefixo do id de uma linha do menu Alterar: `campo:{proposalId}:{campo}` (#178). */
export const PREFIXO_CAMPO = "campo"
/** Prefixo do id de uma linha da lista de Competência (mês): `mes:{proposalId}:{YYYY-MM}` (#178). */
export const PREFIXO_ESCOLHER_MES = "mes"

/** Todo campo coletado que o menu Alterar (#178) edita. Conta/Competência por lista; o resto por texto livre. */
export type CampoEditavel = "conta" | "competencia" | "valor" | "data" | "favorecido"
/** Os campos que se editam por **texto livre** (parser determinístico por campo) — subconjunto de `CampoEditavel`. */
export type CampoLivre = "valor" | "data" | "favorecido"

/** O menu Alterar em ordem: rótulo visível de cada campo editável. */
const CAMPOS_MENU: { campo: CampoEditavel; titulo: string }[] = [
  { campo: "conta", titulo: "Conta" },
  { campo: "competencia", titulo: "Competência (mês)" },
  { campo: "valor", titulo: "Valor" },
  { campo: "data", titulo: "Data de pagamento" },
  { campo: "favorecido", titulo: "Favorecido" },
]

const CAMPOS_EDITAVEIS = new Set<string>(CAMPOS_MENU.map((c) => c.campo))
const CAMPOS_LIVRES = new Set<CampoLivre>(["valor", "data", "favorecido"])

/** Um campo de texto livre? (guarda de tipo para o roteamento do texto na borda, #178). */
export function ehCampoLivre(campo: CampoEditavel): campo is CampoLivre {
  return CAMPOS_LIVRES.has(campo as CampoLivre)
}

/** Cabeçalho da lista do menu Alterar. */
export const TITULO_MENU_ALTERAR = "O que você quer alterar?"

/**
 * As linhas do menu Alterar (#178): cada campo editável vira uma linha cujo id
 * carrega a Proposta e o campo (`campo:{proposalId}:{campo}`). Inverso parcial de
 * `parsearAcaoBotao`.
 */
export function linhasCamposProposta(proposalId: string): LinhaInterativa[] {
  return CAMPOS_MENU.map((c) => ({
    id: `${PREFIXO_CAMPO}:${proposalId}:${c.campo}`,
    titulo: c.titulo,
  }))
}

/** Cabeçalho da lista de Competência (mês). */
export const TITULO_LISTA_MESES = "Qual é a Competência (mês)?"

/**
 * As linhas da lista de Competência (#178): cada mês candidato vira uma linha cujo
 * id carrega a Proposta e a Competência (`mes:{proposalId}:{YYYY-MM}`). O rótulo é
 * o mês por extenso, capitalizado ("Julho de 2026").
 */
export function linhasCompetenciasProposta(
  proposalId: string,
  competencias: string[],
): LinhaInterativa[] {
  return competencias.map((comp) => {
    const extenso = descreverMesPorExtenso(comp)
    return {
      id: `${PREFIXO_ESCOLHER_MES}:${proposalId}:${comp}`,
      titulo: cortarTitulo(extenso.charAt(0).toUpperCase() + extenso.slice(1)),
    }
  })
}

/** O texto que pede um campo de texto livre, com um exemplo — serve também de reprompt no parse falho (#178). */
export function promptEdicaoCampo(campo: CampoLivre): string {
  switch (campo) {
    case "valor":
      return "Qual o valor certo? Manda em reais — ex.: *253,43*."
    case "data":
      return "Qual a data de pagamento? Manda *dd/mm* ou *dd/mm/aaaa* — ex.: *05/07/2026*."
    case "favorecido":
      return "Qual o favorecido? Manda o nome como aparece no comprovante."
  }
}

/**
 * O que a Pessoa tocou: um dos três botões da Proposta (Confirmar/Trocar/Cancelar)
 * ou uma linha da lista de Trocar Conta (escolher a Conta). Inverso de
 * `botoesDaProposta`/`linhasContasProposta`. `null` = id irreconhecível — a borda
 * ignora em silêncio, nunca chuta uma ação.
 */
export type AcaoProposta =
  | { acao: "confirmar" | "cancelar"; proposalId: string }
  | { acao: "alterar"; proposalId: string }
  | { acao: "escolher-campo"; proposalId: string; campo: CampoEditavel }
  | { acao: "escolher-conta"; proposalId: string; billId: string }
  | { acao: "escolher-mes"; proposalId: string; competencia: string }

export function parsearAcaoBotao(replyId: string): AcaoProposta | null {
  const partes = replyId.split(":")
  if (partes.length === 2) {
    const [acao, proposalId] = partes
    if (!proposalId) return null
    if (acao === ACAO_CONFIRMAR || acao === ACAO_CANCELAR) return { acao, proposalId }
    // "Alterar" (#178) e o "Trocar Conta" legado (#159) caem no mesmo menu de campos.
    if (acao === ACAO_ALTERAR || acao === ACAO_TROCAR) return { acao: "alterar", proposalId }
    return null
  }
  if (partes.length === 3) {
    const [prefixo, proposalId, valor] = partes
    if (!proposalId || !valor) return null
    if (prefixo === PREFIXO_ESCOLHER_CONTA) {
      return { acao: "escolher-conta", proposalId, billId: valor }
    }
    if (prefixo === PREFIXO_CAMPO && CAMPOS_EDITAVEIS.has(valor)) {
      return { acao: "escolher-campo", proposalId, campo: valor as CampoEditavel }
    }
    if (prefixo === PREFIXO_ESCOLHER_MES && ehCompetenciaValida(valor)) {
      return { acao: "escolher-mes", proposalId, competencia: valor }
    }
  }
  return null
}

/** Tempo de vida de uma Proposta não respondida (dias) — expiração derivada do relógio (#159, invariante #3). */
export const TTL_PROPOSTA_DIAS = 7

/**
 * A Proposta expirou? Verdade **derivada** do relógio (`criadoEm + TTL < hoje`),
 * não uma coluna: o estado `expirada` persistido é só o carimbo do ato de limpeza.
 * Compara em data civil — granularidade de dia basta para um TTL de 7 dias.
 */
export function estaExpirada(
  proposta: Pick<PaymentProposal, "criadoEm">,
  hojeCivil: string,
): boolean {
  const nascimento = new Date(`${proposta.criadoEm.slice(0, 10)}T00:00:00.000Z`)
  nascimento.setUTCDate(nascimento.getUTCDate() + TTL_PROPOSTA_DIAS)
  return hojeCivil > nascimento.toISOString().slice(0, 10)
}

/** A Proposta velha (TTL estourado): não vira fato; orienta reenviar para abrir uma nova. */
export function mensagemPropostaExpirada(): string {
  return "Essa Proposta expirou (mais de 7 dias). Manda o comprovante de novo que eu faço uma nova. 🔁"
}

/**
 * O resumo do **fato criado** no Confirmar (#159): o Lançamento nasceu com Conta,
 * valor e Competência. Distinto de `formatarPropostaMensagem` (que ainda pede aval);
 * aqui é a confirmação de que registrou.
 */
export function formatarLancamentoCriado(resumo: ResumoProposta): string {
  return [
    "Pronto! Registrei o pagamento ✅",
    "",
    `*Conta:* ${resumo.contaNome ?? "—"}`,
    `*Valor:* ${resumo.valor ?? "—"}`,
    `*Competência:* ${resumo.competencia ?? "—"}`,
  ].join("\n")
}
