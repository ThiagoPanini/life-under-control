import type { WhatsappMessenger } from "@/core/ports/whatsapp-messenger"

const GRAPH_API_VERSION = "v21.0"
const TIMEOUT_MS = 10_000

type Config = { phoneNumberId: string; accessToken: string }

/**
 * Adapter fino do `WhatsappMessenger` sobre a Graph API (ADR-0012, issue
 * #155). Nunca lança — falha de rede ou resposta não-OK só loga; o webhook
 * que chama isso precisa responder 200 rápido pra Meta, não travar num retry.
 */
export function httpWhatsappMessenger({ phoneNumberId, accessToken }: Config): WhatsappMessenger {
  return {
    async enviarTexto(para: string, corpo: string): Promise<void> {
      try {
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: para,
              type: "text",
              text: { body: corpo },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        )
        if (!res.ok) console.error(`whatsapp: envio falhou com status ${res.status}`)
      } catch (e) {
        console.error("whatsapp: envio falhou", e)
      }
    },
  }
}
