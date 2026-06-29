import type { AttachmentRepo } from "../ports/attachment-repo"
import type { AttachmentStore } from "../ports/attachment-store"

/**
 * Use-case: remove um comprovante — apaga os metadados (escopado pelo Lar) **e**
 * o objeto no R2. Substituir é remover e anexar de novo, então não há use-case
 * próprio. Apaga primeiro o metadado (a fonte de verdade do que existe) e só
 * então o objeto; se o metadado não estava lá (`null`), não toca o bucket e
 * devolve `false`. As duas Pessoas removem (acesso simétrico, #1).
 */
export async function removeAttachment(
  store: AttachmentStore,
  repo: AttachmentRepo,
  householdId: string,
  attachmentId: string,
): Promise<boolean> {
  const removido = await repo.deletarAttachment(householdId, attachmentId)
  if (!removido) return false
  await store.remover(removido.chaveR2)
  return true
}
