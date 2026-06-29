import type { AttachmentRepo } from "../ports/attachment-repo"
import type { AttachmentStore } from "../ports/attachment-store"

/**
 * Use-case: resgata um comprovante — devolve uma **URL assinada de leitura** para
 * abri-lo/baixá-lo. Carrega o metadado escopado pelo Lar (um Anexo de outro Lar é
 * invisível, #1); `null` se não achou — a borda então responde 404, sem assinar
 * URL de objeto alheio. Os bytes nunca passam pelo app (ADR-0008).
 */
export async function openAttachment(
  store: AttachmentStore,
  repo: AttachmentRepo,
  householdId: string,
  attachmentId: string,
): Promise<string | null> {
  const att = await repo.obterAttachment(householdId, attachmentId)
  if (!att) return null
  return store.urlDeLeitura(att.chaveR2)
}
