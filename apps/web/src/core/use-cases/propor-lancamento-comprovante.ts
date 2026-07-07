import { randomUUID } from "node:crypto"
import { type Bill, formatarDataBr } from "../domain/bill"
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
import type { ContaMatcher } from "../ports/conta-matcher"
import { type PaymentProposalRepo, PropostaDuplicadaError } from "../ports/payment-proposal-repo"
import type { PaymentRepo } from "../ports/payment-repo"
import { ehMimeComprovanteSuportado, type ReceiptExtractor } from "../ports/receipt-extractor"
import type { WhatsappMediaFetcher } from "../ports/whatsapp-media-fetcher"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"
import { inferirCompetenciaRecibo } from "./inferir-competencia-recibo"

/**
 * Pipeline do comprovante do WhatsApp → Proposta de Lançamento (ADR-0012,
 * ADR-0013, issue #158). Roda **pós-resposta** ao webhook (o handler já devolveu
 * 200): baixa a mídia pelo media ID na Graph API (nunca URL do payload —
 * anti-SSRF), detecta reenvio do mesmo arquivo por hash, extrai o recibo (#156),
 * casa a Conta e infere a Competência (funções puras de #162), estaciona os bytes
 * casa a Conta por LLM (#177) e infere a Competência (função pura de #162),
 * estaciona os bytes numa chave de staging e persiste a Proposta, respondendo no
 * chat com botões.
 *
 * Só orquestra ports — a regra vive no núcleo. A borda (webhook) resolve a Pessoa
 * e o Lar e chama isto por comprovante. **Sempre responde algo** em vez de sumir:
 * mídia/extração fora → "tente de novo" (transitório, recuperável no reenvio);
 * tipo de arquivo não suportado → pede outro formato (permanente); falha ao
 * estacionar/persistir → "tente de novo" e limpa o staging órfão.
 */

/** Resposta de degradação transitória (mídia/extração/persistência indisponível) — o reenvio recupera. */
export const TEXTO_TENTE_DE_NOVO =
  "Tive um problema pra ler seu comprovante agora. Pode mandar de novo daqui a pouco? 🙏"

/** Resposta de erro **permanente**: o tipo de arquivo não é legível — pedir outro não adianta insistir no mesmo. */
export const TEXTO_TIPO_NAO_SUPORTADO =
  "Não consigo ler esse tipo de arquivo. Manda uma foto (JPG ou PNG) ou o PDF do comprovante, por favor. 📎"

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
  matcher: ContaMatcher
  billRepo: Pick<BillRepo, "listarBills">
  paymentRepo: Pick<PaymentRepo, "listarTodosPayments">
  proposalRepo: PaymentProposalRepo
  store: Pick<AttachmentStore, "enviar" | "remover">
  messenger: WhatsappMessenger
  clock: Clock
  calendar: Calendar
  /** Gera o id da Proposta (e da chave de staging) — injetável pro teste ser determinístico. */
  novoId?: () => string
  /** Log injetável (default `console.log`) — não prende o use-case ao console global. */
  log?: (mensagem: string) => void
}

/** Remove o staging órfão sem derrubar o fluxo — o objeto vira lixo a coletar se falhar, nunca um throw. */
async function removerStagingSeguro(
  store: Pick<AttachmentStore, "remover">,
  chave: string,
  log: (mensagem: string) => void,
): Promise<void> {
  try {
    await store.remover(chave)
  } catch (e) {
    log(`whatsapp: falha ao limpar staging ${chave}: ${e}`)
  }
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

  // 2. Tipo não legível = erro PERMANENTE (não transitório): pedir o mesmo de
  //    novo nunca resolveria — orienta a mandar foto/PDF. (Distinto de "tente de
  //    novo".) Pré-checa contra a mesma fonte que o extrator (#156).
  if (!ehMimeComprovanteSuportado(baixada.tipoMime)) {
    log(`whatsapp: tipo ${baixada.tipoMime} não suportado (evento ${waMessageId})`)
    await deps.messenger.enviarTexto(remetente, TEXTO_TIPO_NAO_SUPORTADO)
    return
  }

  // 3. Repetição = mesmo arquivo (hash dos bytes), checada antes da extração cara.
  //    Mesmo hash com Proposta aberta ou já virada Lançamento → avisa, não duplica.
  const bytesHash = hashComprovante(baixada.conteudo)
  const existente = await deps.proposalRepo.obterAtivaPorHash(householdId, bytesHash)
  if (existente) {
    await deps.messenger.enviarTexto(remetente, mensagemComprovanteRepetido(existente))
    return
  }

  // 4. Extração via port (#156). Extrator fora = transitório: pede reenvio e não
  //    estaciona nem persiste nada (o evento é recuperável).
  let recibo: ReciboWhatsapp
  try {
    recibo = await deps.extractor(baixada.conteudo, baixada.tipoMime)
  } catch (e) {
    log(`whatsapp: extração falhou (evento ${waMessageId}): ${e}`)
    await deps.messenger.enviarTexto(remetente, TEXTO_TENTE_DE_NOVO)
    return
  }

  // 5. Matching de Conta pelo `ContaMatcher` LLM (#177): só Contas ativas
  //    concorrem; o topo da ordenação vira a Conta proposta e vazio = abstenção
  //    (Conta não identificada, sem palpite). A Competência é inferida a seguir
  //    por função pura determinística (#162), sobre a Conta escolhida.
  const bills = await deps.billRepo.listarBills(householdId)
  const todosPayments = await deps.paymentRepo.listarTodosPayments(householdId)
  const ativas = bills.filter((b) => b.estado === "ativa")
  const ranking = await deps.matcher(
    recibo.favorecido,
    ativas.map((b) => ({ billId: b.id, nome: b.nome })),
  )
  const contaCasada: Bill | null =
    ranking.length > 0 ? (ativas.find((b) => b.id === ranking[0]) ?? null) : null

  const competencia = contaCasada
    ? inferirCompetenciaRecibo(
        contaCasada,
        todosPayments.filter((p) => p.billId === contaCasada.id),
        deps.clock.hoje(),
        deps.calendar,
        recibo.vencimentoImpresso,
      )
    : null

  // 6. Staging dos bytes (chave transitória — sem Lançamento ainda) + Proposta.
  //    Falha aqui NÃO some em silêncio: limpa o staging órfão e responde. A
  //    corrida (duas entregas do mesmo arquivo) vira `PropostaDuplicadaError`
  //    pelo índice único → avisa referenciando a existente, não duplica.
  const id = novoId()
  const stagingKey = chaveStaging(householdId, id)
  try {
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
  } catch (e) {
    await removerStagingSeguro(deps.store, stagingKey, log)
    if (e instanceof PropostaDuplicadaError) {
      const jaExistente = await deps.proposalRepo.obterAtivaPorHash(householdId, bytesHash)
      if (jaExistente) {
        await deps.messenger.enviarTexto(remetente, mensagemComprovanteRepetido(jaExistente))
        return
      }
    }
    log(`whatsapp: falha ao estacionar/persistir (evento ${waMessageId}): ${e}`)
    await deps.messenger.enviarTexto(remetente, TEXTO_TENTE_DE_NOVO)
    return
  }

  // 7. Responde a Proposta no chat com botões; campo ilegível sai sinalizado em
  //    branco (nunca palpite — ADR-0013).
  const resumo: ResumoProposta = {
    contaNome: contaCasada?.nome ?? null,
    valor: recibo.valorCentavos !== null ? formatBRL(recibo.valorCentavos) : null,
    dataPagamento: recibo.dataPagamento ? formatarDataBr(recibo.dataPagamento) : null,
    competencia:
      competencia && contaCasada ? descreverCompetencia(competencia, contaCasada.recurrence) : null,
  }
  await deps.messenger.enviarBotoes(
    remetente,
    formatarPropostaMensagem(resumo),
    botoesDaProposta(id),
  )
}
