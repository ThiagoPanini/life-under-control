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
export const ACAO_TROCAR = "trocar"
export const ACAO_CANCELAR = "cancelar"

/**
 * Os três botões de uma Proposta, cada um carregando o id dela na ação para o
 * webhook de resposta (#159) saber sobre qual Proposta a Pessoa agiu.
 */
export function botoesDaProposta(proposalId: string): BotaoInterativo[] {
  return [
    { id: `${ACAO_CONFIRMAR}:${proposalId}`, titulo: "Confirmar" },
    { id: `${ACAO_TROCAR}:${proposalId}`, titulo: "Trocar Conta" },
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
const SEM_CONTA = "_não identifiquei — toque *Trocar Conta*_"

/**
 * Compõe a mensagem da Proposta para o chat: Conta candidata, valor, data de
 * pagamento e Competência, uma por linha. Campo `null` é sinalizado em branco
 * (nunca um valor inventado); Conta ausente orienta o *Trocar Conta*.
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
