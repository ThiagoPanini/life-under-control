import type { Attachment } from "@/core/domain/attachment"
import type { AttachmentRepo, NovoAttachment } from "@/core/ports/attachment-repo"

/**
 * Fake do `AttachmentRepo` para o Seam 1 — um store em memória que honra o escopo
 * por Lar (operar fora do `householdId` não acha o Anexo), partilhado pelos testes
 * dos use-cases de comprovante. Sem banco: a regra mora no núcleo (ADR-0003). O
 * `criadoEm` é um instante fixo (o banco real usa `now()`); o teste não o crava.
 */
export function fakeAttachmentRepo(seed: Attachment[] = []): AttachmentRepo {
  const store = new Map<string, Attachment>(seed.map((a) => [a.id, a]))

  return {
    async criarAttachment(novo: NovoAttachment): Promise<Attachment> {
      const att: Attachment = { ...novo, criadoEm: "2026-01-01T00:00:00.000Z" }
      store.set(att.id, att)
      return att
    },
    async listarAttachments(householdId, paymentId) {
      return [...store.values()].filter(
        (a) => a.householdId === householdId && a.paymentId === paymentId,
      )
    },
    async listarAttachmentsPorPayments(householdId, paymentIds) {
      const alvo = new Set(paymentIds)
      return [...store.values()].filter(
        (a) => a.householdId === householdId && alvo.has(a.paymentId),
      )
    },
    async obterAttachment(householdId, attachmentId) {
      const att = store.get(attachmentId)
      return att && att.householdId === householdId ? att : null
    },
    async deletarAttachment(householdId, attachmentId) {
      const att = store.get(attachmentId)
      if (!att || att.householdId !== householdId) return null
      store.delete(attachmentId)
      return att
    },
  }
}
