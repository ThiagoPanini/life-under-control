import type { BotaoInterativo, LinhaInterativa } from "@/core/domain/payment-proposal"
import type { TemplateWhatsapp, WhatsappMessenger } from "@/core/ports/whatsapp-messenger"

export type WhatsappMessengerFake = WhatsappMessenger & {
  enviados: { para: string; corpo: string }[]
  interativos: { para: string; corpo: string; botoes: BotaoInterativo[] }[]
  listas: { para: string; corpo: string; linhas: LinhaInterativa[]; rotuloBotao: string }[]
  templates: { para: string; template: TemplateWhatsapp }[]
}

export function fakeWhatsappMessenger(): WhatsappMessengerFake {
  const enviados: { para: string; corpo: string }[] = []
  const interativos: { para: string; corpo: string; botoes: BotaoInterativo[] }[] = []
  const listas: { para: string; corpo: string; linhas: LinhaInterativa[]; rotuloBotao: string }[] =
    []
  const templates: { para: string; template: TemplateWhatsapp }[] = []

  return {
    enviados,
    interativos,
    listas,
    templates,
    async enviarTexto(para, corpo) {
      enviados.push({ para, corpo })
    },
    async enviarBotoes(para, corpo, botoes) {
      interativos.push({ para, corpo, botoes })
    },
    async enviarLista(para, corpo, linhas, rotuloBotao) {
      listas.push({ para, corpo, linhas, rotuloBotao })
    },
    async enviarTemplate(para, template) {
      templates.push({ para, template })
      return true
    },
  }
}
