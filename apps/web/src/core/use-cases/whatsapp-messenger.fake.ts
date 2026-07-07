import type { BotaoInterativo } from "@/core/domain/payment-proposal"
import type { WhatsappMessenger } from "@/core/ports/whatsapp-messenger"

export type WhatsappMessengerFake = WhatsappMessenger & {
  enviados: { para: string; corpo: string }[]
  interativos: { para: string; corpo: string; botoes: BotaoInterativo[] }[]
}

export function fakeWhatsappMessenger(): WhatsappMessengerFake {
  const enviados: { para: string; corpo: string }[] = []
  const interativos: { para: string; corpo: string; botoes: BotaoInterativo[] }[] = []

  return {
    enviados,
    interativos,
    async enviarTexto(para, corpo) {
      enviados.push({ para, corpo })
    },
    async enviarBotoes(para, corpo, botoes) {
      interativos.push({ para, corpo, botoes })
    },
  }
}
