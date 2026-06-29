import type { Attachment } from "../domain/attachment"
import type { AttachmentRepo } from "../ports/attachment-repo"

/**
 * Use-case: lista os comprovantes de um Lançamento do Lar (acesso simétrico, #1).
 * Pass-through pelo port — a ordenação e o escopo moram no adapter.
 */
export async function listAttachments(
  repo: AttachmentRepo,
  householdId: string,
  paymentId: string,
): Promise<Attachment[]> {
  return repo.listarAttachments(householdId, paymentId)
}

/**
 * Use-case: lista os comprovantes de vários Lançamentos do Lar de uma vez, já
 * agrupados por Lançamento — o detalhe da Conta pendura cada lista na sua linha
 * sem disparar uma consulta por Lançamento (evita N+1). Lançamentos sem anexo
 * saem com lista vazia.
 */
export async function listAttachmentsDeLancamentos(
  repo: AttachmentRepo,
  householdId: string,
  paymentIds: string[],
): Promise<Record<string, Attachment[]>> {
  const todos = await repo.listarAttachmentsPorPayments(householdId, paymentIds)
  const porLancamento: Record<string, Attachment[]> = Object.fromEntries(
    paymentIds.map((id) => [id, []]),
  )
  for (const a of todos) porLancamento[a.paymentId]?.push(a)
  return porLancamento
}
