import type { WhatsappEventRepo } from "@/core/ports/whatsapp-event-repo"

export function fakeWhatsappEventRepo(): WhatsappEventRepo {
  const processados = new Set<string>()

  return {
    async jaProcessado(waMessageId) {
      return processados.has(waMessageId)
    },
    async registrar(evento) {
      processados.add(evento.waMessageId)
    },
  }
}
