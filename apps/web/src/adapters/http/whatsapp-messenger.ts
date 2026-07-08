import type { BotaoInterativo, LinhaInterativa } from "@/core/domain/payment-proposal"
import type { TemplateWhatsapp, WhatsappMessenger } from "@/core/ports/whatsapp-messenger"

const GRAPH_API_VERSION = "v21.0"
const TIMEOUT_MS = 10_000

type Config = { phoneNumberId: string; accessToken: string }

/**
 * Adapter fino do `WhatsappMessenger` sobre a Graph API (ADR-0012, issues
 * #155/#158). Nunca lança — falha de rede ou resposta não-OK só loga; o webhook
 * que chama isso precisa responder 200 rápido pra Meta, não travar num retry.
 */
export function httpWhatsappMessenger({ phoneNumberId, accessToken }: Config): WhatsappMessenger {
  /** `true` só quando a Meta aceitou (2xx); falha de rede/não-OK loga e devolve `false`. */
  async function enviar(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      )
      if (!res.ok) {
        console.error(`whatsapp: envio falhou com status ${res.status}`)
        return false
      }
      return true
    } catch (e) {
      console.error("whatsapp: envio falhou", e)
      return false
    }
  }

  return {
    async enviarTexto(para, corpo) {
      await enviar({ to: para, type: "text", text: { body: corpo } })
    },
    async enviarBotoes(para, corpo, botoes: BotaoInterativo[]) {
      await enviar({
        to: para,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: corpo },
          action: {
            buttons: botoes.map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo } })),
          },
        },
      })
    },
    async enviarLista(para, corpo, linhas: LinhaInterativa[], rotuloBotao: string) {
      await enviar({
        to: para,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: corpo },
          action: {
            // O rótulo do botão varia por contexto (#178): antes era fixo "Escolher
            // Conta", o que mislabelava o menu Alterar e a lista de Mês.
            button: rotuloBotao,
            sections: [
              { title: "Opções", rows: linhas.map((l) => ({ id: l.id, title: l.titulo })) },
            ],
          },
        },
      })
    },
    async enviarTemplate(para, template: TemplateWhatsapp) {
      return enviar({
        to: para,
        type: "template",
        template: {
          name: template.nome,
          language: { code: template.idioma },
          components: [
            {
              type: "body",
              parameters: template.params.map((text) => ({ type: "text", text })),
            },
          ],
        },
      })
    },
  }
}

/**
 * Monta o messenger a partir do env de produção (WHATSAPP_PHONE_NUMBER_ID /
 * WHATSAPP_ACCESS_TOKEN). Fonte única do fio env→messenger, compartilhada pelo
 * webhook (#155) e pelo disparo do digest (#160) — muda num lugar só.
 */
export function whatsappMessengerFromEnv(): WhatsappMessenger {
  return httpWhatsappMessenger({
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  })
}
