import type { WhatsappMessenger } from "@/core/ports/whatsapp-messenger"

export type WhatsappMessengerFake = WhatsappMessenger & {
  enviados: { para: string; corpo: string }[]
}

export function fakeWhatsappMessenger(): WhatsappMessengerFake {
  const enviados: { para: string; corpo: string }[] = []

  return {
    enviados,
    async enviarTexto(para, corpo) {
      enviados.push({ para, corpo })
    },
  }
}
