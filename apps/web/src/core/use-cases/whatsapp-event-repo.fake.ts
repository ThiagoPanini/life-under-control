import type { WhatsappEventRepo } from "@/core/ports/whatsapp-event-repo"

export function fakeWhatsappEventRepo(): WhatsappEventRepo {
  const reivindicados = new Set<string>()

  return {
    async reivindicar(evento) {
      if (reivindicados.has(evento.waMessageId)) return false
      reivindicados.add(evento.waMessageId)
      return true
    },
    async liberar(evento) {
      reivindicados.delete(evento.waMessageId)
    },
  }
}
