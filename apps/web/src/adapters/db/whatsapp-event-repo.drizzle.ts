import { eq } from "drizzle-orm"
import type { WhatsappEventRepo } from "@/core/ports/whatsapp-event-repo"
import { type Db, getDb } from "./client"
import { whatsappEvents } from "./schema"

/**
 * `jaProcessado` + `registrar` do use-case não são atômicos (TOCTOU): duas
 * entregas do mesmo `wa_message_id` quase simultâneas podem passar ambas pela
 * checagem antes de qualquer escrita. O índice único no banco é quem de fato
 * garante a idempotência — aqui, a segunda escrita vira um no-op silencioso
 * em vez de subir o erro cru do Postgres (o efeito colateral, se houve, já
 * rodou uma vez só; registrar de novo não muda nada).
 */
function ehDuplicataDeWhatsappEvent(e: unknown): boolean {
  const causa =
    typeof e === "object" && e !== null && "cause" in e ? (e as { cause: unknown }).cause : e
  return (
    typeof causa === "object" &&
    causa !== null &&
    (causa as { code?: unknown }).code === "23505" &&
    (causa as { constraint?: unknown }).constraint === "whatsapp_events_wa_message_id_unique"
  )
}

/** Adapter Drizzle da tabela de eventos da borda do webhook (ADR-0012, issue #155). */
export function drizzleWhatsappEventRepo(db: Db = getDb()): WhatsappEventRepo {
  return {
    async jaProcessado(waMessageId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: whatsappEvents.id })
        .from(whatsappEvents)
        .where(eq(whatsappEvents.waMessageId, waMessageId))
      return row !== undefined
    },

    async registrar(evento: { waMessageId: string; remetente: string }): Promise<void> {
      try {
        await db.insert(whatsappEvents).values(evento)
      } catch (e) {
        if (ehDuplicataDeWhatsappEvent(e)) return
        throw e
      }
    },
  }
}
