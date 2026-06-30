import { chaveComprovante } from "../domain/attachment"
import type { LinhaManifesto } from "../domain/backfill"
import { type Payment, validarDadosPayment } from "../domain/payment"
import type { AttachmentRepo } from "../ports/attachment-repo"
import type { AttachmentStore } from "../ports/attachment-store"
import type { PaymentRepo } from "../ports/payment-repo"
import { registerAttachment } from "./register-attachment"

/** Os bytes de um comprovante lidos da origem (disco do operador) + seu tipo. */
export type ConteudoRecibo = { conteudo: Uint8Array; tipoMime: string }

/**
 * Carrega os bytes de um comprovante a partir do rótulo `arquivo` do manifesto.
 * É a fronteira de IO da ingestão (lê `/mnt/c`, etc.): o use-case é puro, esta
 * função é o que a borda injeta. `null` quando o arquivo não está acessível —
 * o Lançamento ainda entra, só sem anexo.
 */
export type CarregarRecibo = (arquivo: string) => Promise<ConteudoRecibo | null>

/** O resultado conferível de uma rodada de import. */
export type ResultadoImport = {
  /** Os Lançamentos criados nesta rodada. */
  criados: Payment[]
  /** Quantos foram pulados por já existirem (idempotência). */
  pulados: number
  /** As linhas com divergência — **não** inseridas, pra revisão manual. */
  emRevisao: LinhaManifesto[]
  /** As linhas que falharam na validação de domínio (forma inválida) — não inseridas. */
  invalidos: LinhaManifesto[]
  /** Quantos comprovantes subiram pro R2 e viraram Anexo. */
  anexos: number
  /** As linhas com comprovante que **não** anexou (arquivo inacessível ou erro no R2) — reparável numa próxima rodada. */
  falhasAnexo: LinhaManifesto[]
}

/** Só o nome do arquivo (rótulo de exibição do Anexo), sem o caminho. */
function nomeDoArquivo(caminho: string): string {
  return caminho.split("/").pop() ?? caminho
}

/**
 * Import histórico determinístico (issue #24): consome um manifesto já conferido e
 * cria os Lançamentos, subindo os comprovantes pro R2. Diferente da baixa normal
 * (`recordPayment`), **preserva a data nula** — uma linha sem recibo legível vira
 * "pago sem data", não "pago hoje". Linhas marcadas `revisar` não entram (divergência
 * não se insere calada). É **idempotente**: a competência que já tem Lançamento na
 * Conta não duplica — mas se esse Lançamento ficou **sem anexo** (o arquivo estava
 * inacessível numa rodada anterior) e agora há comprovante, re-anexa. O Anexo reusa
 * `registerAttachment` — sobe os bytes (`store.enviar`) e registra os metadados
 * **reais** que o bucket devolve. Anexar **degrada com elegância**: um arquivo
 * inacessível, grande demais (#3) ou um erro transitório do R2 vai pra `falhasAnexo`
 * e segue o lote — nunca aborta o import inteiro.
 */
export async function importBackfill(
  paymentRepo: PaymentRepo,
  attachmentStore: AttachmentStore,
  attachmentRepo: AttachmentRepo,
  carregarRecibo: CarregarRecibo,
  householdId: string,
  manifesto: LinhaManifesto[],
): Promise<ResultadoImport> {
  const resultado: ResultadoImport = {
    criados: [],
    pulados: 0,
    emRevisao: [],
    invalidos: [],
    anexos: 0,
    falhasAnexo: [],
  }

  /**
   * Sobe o comprovante e registra o Anexo, reusando `registerAttachment`. Idempotente
   * pelo id derivado (`<paymentId>-0`): re-anexar sobrescreve o mesmo objeto/registro,
   * não duplica. Devolve `false` (sem lançar) quando o arquivo está inacessível ou o
   * upload/registro falha — o Lançamento fica sem anexo, reparável numa próxima rodada.
   */
  async function anexar(paymentId: string, paidBy: string, arquivo: string): Promise<boolean> {
    const bytes = await carregarRecibo(arquivo)
    if (!bytes) return false // arquivo inacessível: o Lançamento fica, sem anexo

    const attachmentId = `${paymentId}-0`
    const chave = chaveComprovante(householdId, paymentId, attachmentId)
    try {
      await attachmentStore.enviar(chave, bytes.conteudo, bytes.tipoMime)
      await registerAttachment(
        attachmentRepo,
        attachmentStore,
        householdId,
        paymentId,
        attachmentId,
        paidBy,
        nomeDoArquivo(arquivo),
      )
      return true
    } catch {
      return false // erro no R2 ou na validação do Anexo: não derruba o lote
    }
  }

  for (const linha of manifesto) {
    if (linha.revisar) {
      resultado.emRevisao.push(linha)
      continue
    }

    // Valida a forma no núcleo antes de gravar — o backfill não fura o invariante
    // (#6: centavos > 0) só por confiar no manifesto. `validarDadosPayment` preserva
    // a data nula ("pago sem data"), então não reescreve com hoje como o `recordPayment`.
    const validado = validarDadosPayment({
      valor: linha.valor,
      dataPagamento: linha.dataPagamento,
      competencia: linha.competencia,
      paidBy: linha.paidBy,
    })
    if (!validado.ok) {
      resultado.invalidos.push(linha)
      continue
    }

    // Idempotência: a competência já tem Lançamento nesta Conta?
    const existentes = await paymentRepo.listarPayments(householdId, linha.billId)
    const existente = existentes.find((p) => p.competencia === linha.competencia)

    if (existente) {
      resultado.pulados += 1
      // Não duplica o Lançamento — mas se ele ficou sem anexo e agora há comprovante,
      // re-anexa (repara uma rodada anterior em que o arquivo estava inacessível).
      if (linha.recibo) {
        const anexos = await attachmentRepo.listarAttachments(householdId, existente.id)
        if (anexos.length === 0) {
          if (await anexar(existente.id, linha.paidBy, linha.recibo.arquivo)) resultado.anexos += 1
          else resultado.falhasAnexo.push(linha)
        }
      }
      continue
    }

    const pay = await paymentRepo.criarPayment({
      ...validado.value,
      householdId,
      billId: linha.billId,
    })
    resultado.criados.push(pay)

    if (!linha.recibo) continue
    if (await anexar(pay.id, linha.paidBy, linha.recibo.arquivo)) resultado.anexos += 1
    else resultado.falhasAnexo.push(linha)
  }

  return resultado
}
