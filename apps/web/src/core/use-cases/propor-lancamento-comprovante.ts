import { randomUUID } from "node:crypto"
import type { Bill } from "../domain/bill"
import { formatBRL } from "../domain/money"
import { descreverCompetencia } from "../domain/payment"
import {
  botoesDaProposta,
  chaveStaging,
  formatarPropostaMensagem,
  hashComprovante,
  mensagemComprovanteRepetido,
  type ResumoProposta,
} from "../domain/payment-proposal"
import type { ReciboWhatsapp } from "../domain/recibo-whatsapp"
import type { MidiaRecebida } from "../domain/whatsapp-evento"
import type { AttachmentStore } from "../ports/attachment-store"
import type { BillRepo } from "../ports/bill-repo"
import type { Calendar } from "../ports/calendar"
import type { Clock } from "../ports/clock"
import type { PaymentProposalRepo } from "../ports/payment-proposal-repo"
import type { PaymentRepo } from "../ports/payment-repo"
import type { ReceiptExtractor } from "../ports/receipt-extractor"
import type { WhatsappMediaFetcher } from "../ports/whatsapp-media-fetcher"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"
import { type CandidatoConta, casarReciboConta } from "./casar-recibo-conta"
import { inferirCompetenciaRecibo } from "./inferir-competencia-recibo"

/**
 * Pipeline do comprovante do WhatsApp → Proposta de Lançamento (ADR-0012,
 * ADR-0013, issue #158). Roda **pós-resposta** ao webhook (o handler já devolveu
 * 200): baixa a mídia pelo media ID na Graph API (nunca URL do payload —
 * anti-SSRF), detecta reenvio do mesmo arquivo por hash, extrai o recibo (#156),
 * casa a Conta e infere a Competência (funções puras de #162), estaciona os bytes
 * numa chave de staging e persiste a Proposta, respondendo no chat com botões.
 *
 * Só orquestra ports — a regra vive no núcleo. A borda (webhook) resolve a Pessoa
 * e o Lar e chama isto por comprovante. Degrada em vez de derrubar: mídia fora ou
 * extrator fora respondem "tente de novo" sem persistir nada (o evento é
 * recuperável no reenvio).
 */

/** Resposta de degradação transitória (mídia/extração indisponível) — o reenvio recupera. */
export const TEXTO_TENTE_DE_NOVO =
  "Tive um problema pra ler seu comprovante agora. Pode mandar de novo daqui a pouco? 🙏"

/** Um comprovante recebido, já com a Pessoa e o Lar resolvidos pela borda. */
export type ComprovanteEntrada = {
  /** O Lar da Pessoa vinculada — escopa todo acesso a dado (#1). */
  householdId: string
  /** A Pessoa que enviou (id) — autoria do futuro Lançamento, não permissão (#1). */
  paidBy: string
  /** Número do remetente (como veio no evento) — para responder no chat. */
  remetente: string
  waMessageId: string
  midia: MidiaRecebida
}

export type ComprovanteDeps = {
  mediaFetcher: WhatsappMediaFetcher
  extractor: ReceiptExtractor
  billRepo: Pick<BillRepo, "listarBills">
  paymentRepo: Pick<PaymentRepo, "listarTodosPayments">
  proposalRepo: PaymentProposalRepo
  store: Pick<AttachmentStore, "enviar">
  messenger: WhatsappMessenger
  clock: Clock
  calendar: Calendar
  /** Gera o id da Proposta (e da chave de staging) — injetável pro teste ser determinístico. */
  novoId?: () => string
  /** Log injetável (default `console.log`) — não prende o use-case ao console global. */
  log?: (mensagem: string) => void
}

/** Data civil ISO (YYYY-MM-DD) → exibição pt-BR (DD/MM/YYYY). */
function formatarDataCivil(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}

export async function proporLancamentoComprovante(
  deps: ComprovanteDeps,
  entrada: ComprovanteEntrada,
): Promise<void> {
  const log = deps.log ?? console.log
  const novoId = deps.novoId ?? randomUUID
  const { householdId, paidBy, remetente, waMessageId, midia } = entrada

  // 1. Download imediato pelo media ID (a URL efêmera da Meta expira em minutos).
  //    Falha = mídia sumida/rede fora → degrada e pede reenvio.
  const baixada = await deps.mediaFetcher.baixar(midia.mediaId)
  if (!baixada) {
    log(`whatsapp: mídia ${midia.mediaId} indisponível (evento ${waMessageId})`)
    await deps.messenger.enviarTexto(remetente, TEXTO_TENTE_DE_NOVO)
    return
  }

  // 2. Repetição = mesmo arquivo (hash dos bytes), checada antes da extração cara.
  //    Mesmo hash com Proposta aberta ou já virada Lançamento → avisa, não duplica.
  const bytesHash = hashComprovante(baixada.conteudo)
  const existente = await deps.proposalRepo.obterAtivaPorHash(householdId, bytesHash)
  if (existente) {
    await deps.messenger.enviarTexto(remetente, mensagemComprovanteRepetido(existente))
    return
  }

  // 3. Extração via port (#156). Extrator fora = transitório: pede reenvio e não
  //    estaciona nem persiste nada (o evento é recuperável).
  let recibo: ReciboWhatsapp
  try {
    recibo = await deps.extractor(baixada.conteudo, baixada.tipoMime)
  } catch (e) {
    log(`whatsapp: extração falhou (evento ${waMessageId}): ${e}`)
    await deps.messenger.enviarTexto(remetente, TEXTO_TENTE_DE_NOVO)
    return
  }

  // 4. Matching de Conta + inferência de Competência (#162). Só Contas ativas
  //    casam; score 0 = sem candidata confiável (Conta não identificada).
  const bills = await deps.billRepo.listarBills(householdId)
  const todosPayments = await deps.paymentRepo.listarTodosPayments(householdId)
  const candidatos: CandidatoConta[] = bills
    .filter((b) => b.estado === "ativa")
    .map((b) => ({ bill: b, payments: todosPayments.filter((p) => p.billId === b.id) }))
  const ranqueados = casarReciboConta(recibo, candidatos, deps.calendar)
  const top = ranqueados[0]
  const contaCasada: Bill | null = top && top.score > 0 ? top.bill : null

  const competencia = contaCasada
    ? inferirCompetenciaRecibo(
        contaCasada,
        todosPayments.filter((p) => p.billId === contaCasada.id),
        deps.clock.hoje(),
        deps.calendar,
        recibo.vencimentoImpresso,
      )
    : null

  // 5. Staging dos bytes (chave transitória — sem Lançamento ainda) + Proposta.
  const id = novoId()
  const stagingKey = chaveStaging(householdId, id)
  await deps.store.enviar(stagingKey, baixada.conteudo, baixada.tipoMime)
  await deps.proposalRepo.criar({
    id,
    householdId,
    waMessageId,
    bytesHash,
    paidBy,
    billId: contaCasada?.id ?? null,
    valorCentavos: recibo.valorCentavos,
    dataPagamento: recibo.dataPagamento,
    competencia,
    favorecido: recibo.favorecido,
    stagingKey,
    tipoMime: baixada.tipoMime,
  })

  // 6. Responde a Proposta no chat com botões; campo ilegível sai sinalizado em
  //    branco (nunca palpite — ADR-0013).
  const resumo: ResumoProposta = {
    contaNome: contaCasada?.nome ?? null,
    valor: recibo.valorCentavos !== null ? formatBRL(recibo.valorCentavos) : null,
    dataPagamento: recibo.dataPagamento ? formatarDataCivil(recibo.dataPagamento) : null,
    competencia:
      competencia && contaCasada ? descreverCompetencia(competencia, contaCasada.recurrence) : null,
  }
  await deps.messenger.enviarBotoes(
    remetente,
    formatarPropostaMensagem(resumo),
    botoesDaProposta(id),
  )
}
