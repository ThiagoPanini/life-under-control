import type { WhatsappEventRepo } from "@/core/ports/whatsapp-event-repo"
import { type Db, getDb } from "./client"
import { ehViolacaoDeUnicidade } from "./postgres-error"
import { whatsappEvents } from "./schema"

/** Adapter Drizzle da tabela de eventos da borda do webhook (ADR-0012, issue #155). */
export function drizzleWhatsappEventRepo(db: Db = getDb()): WhatsappEventRepo {
  return {
    async reivindicar(evento: { waMessageId: string; remetente: string }): Promise<boolean> {
      // Insere primeiro — o índice único em `wa_message_id` é quem decide sob
      // reentrega concorrente, não uma leitura seguida de escrita (que
      // deixaria duas reentregas passarem juntas pela checagem).
      try {
        await db.insert(whatsappEvents).values(evento)
        return true
      } catch (e) {
        if (ehViolacaoDeUnicidade(e, "whatsapp_events_wa_message_id_unique")) return false
        throw e
      }
    },
  }
}
