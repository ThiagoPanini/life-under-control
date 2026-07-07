import type { BotaoInterativo } from "@/core/domain/payment-proposal"
import type { WhatsappMessenger } from "@/core/ports/whatsapp-messenger"

const GRAPH_API_VERSION = "v21.0"
const TIMEOUT_MS = 10_000

type Config = { phoneNumberId: string; accessToken: string }

/**
 * Adapter fino do `WhatsappMessenger` sobre a Graph API (ADR-0012, issues
 * #155/#158). Nunca lança — falha de rede ou resposta não-OK só loga; o webhook
 * que chama isso precisa responder 200 rápido pra Meta, não travar num retry.
 */
export function httpWhatsappMessenger({ phoneNumberId, accessToken }: Config): WhatsappMessenger {
  async function enviar(payload: Record<string, unknown>): Promise<void> {
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
      if (!res.ok) console.error(`whatsapp: envio falhou com status ${res.status}`)
    } catch (e) {
      console.error("whatsapp: envio falhou", e)
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
  }
}
