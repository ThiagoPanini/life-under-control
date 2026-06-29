import { and, desc, eq, inArray } from "drizzle-orm"
import type { Attachment } from "@/core/domain/attachment"
import type { AttachmentRepo, NovoAttachment } from "@/core/ports/attachment-repo"
import { type Db, getDb } from "./client"
import { attachments } from "./schema"

/** Linha bruta da tabela `attachments` (a forma do Drizzle, não a de domínio). */
type AttachmentRow = typeof attachments.$inferSelect

/** Traduz uma linha do Postgres na forma de domínio `Attachment` (instante em ISO). */
function paraDominio(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    householdId: row.householdId,
    paymentId: row.paymentId,
    nomeOriginal: row.nomeOriginal,
    tipoMime: row.tipoMime,
    tamanhoBytes: row.tamanhoBytes,
    chaveR2: row.chaveR2,
    uploadedBy: row.uploadedBy,
    criadoEm: row.criadoEm.toISOString(),
  }
}

/**
 * Adapter Drizzle do `AttachmentRepo` (ADR-0003) — só os *metadados*; os bytes
 * vão pelo `AttachmentStore`. Insere com o `id` explícito (o mesmo da chave R2,
 * gerado na borda antes do upload), escopa tudo pelo Lar e serializa o instante
 * em ISO. O `db` é injetável para o teste de Seam 2.
 */
export function drizzleAttachmentRepo(db: Db = getDb()): AttachmentRepo {
  return {
    async criarAttachment(novo: NovoAttachment): Promise<Attachment> {
      const [row] = await db
        .insert(attachments)
        .values({
          id: novo.id,
          householdId: novo.householdId,
          paymentId: novo.paymentId,
          nomeOriginal: novo.nomeOriginal,
          tipoMime: novo.tipoMime,
          tamanhoBytes: novo.tamanhoBytes,
          chaveR2: novo.chaveR2,
          uploadedBy: novo.uploadedBy,
        })
        .returning()
      return paraDominio(row)
    },

    async listarAttachments(householdId: string, paymentId: string): Promise<Attachment[]> {
      const linhas = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.householdId, householdId), eq(attachments.paymentId, paymentId)))
        // Mais recentes primeiro; o id desempata para uma ordem estável.
        .orderBy(desc(attachments.criadoEm), desc(attachments.id))
      return linhas.map(paraDominio)
    },

    async listarAttachmentsPorPayments(
      householdId: string,
      paymentIds: string[],
    ): Promise<Attachment[]> {
      if (paymentIds.length === 0) return []
      const linhas = await db
        .select()
        .from(attachments)
        .where(
          and(eq(attachments.householdId, householdId), inArray(attachments.paymentId, paymentIds)),
        )
        .orderBy(desc(attachments.criadoEm), desc(attachments.id))
      return linhas.map(paraDominio)
    },

    async obterAttachment(householdId: string, attachmentId: string): Promise<Attachment | null> {
      const [row] = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.householdId, householdId), eq(attachments.id, attachmentId)))
      return row ? paraDominio(row) : null
    },

    async deletarAttachment(householdId: string, attachmentId: string): Promise<Attachment | null> {
      const [row] = await db
        .delete(attachments)
        .where(and(eq(attachments.householdId, householdId), eq(attachments.id, attachmentId)))
        .returning()
      return row ? paraDominio(row) : null
    },
  }
}
