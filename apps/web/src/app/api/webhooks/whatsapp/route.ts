import { after } from "next/server"
import { bedrockReceiptExtractor } from "@/adapters/bedrock/bedrock-receipt-extractor"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleWhatsappProposalRepo } from "@/adapters/db/payment-proposal-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { drizzleUserRepo } from "@/adapters/db/user-repo.drizzle"
import { drizzleWhatsappEventRepo } from "@/adapters/db/whatsapp-event-repo.drizzle"
import { httpWhatsappMediaFetcher } from "@/adapters/http/whatsapp-media-fetcher"
import { httpWhatsappMessenger } from "@/adapters/http/whatsapp-messenger"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { assinaturaValida } from "@/core/domain/whatsapp-assinatura"
import { verificarChallengeWebhook } from "@/core/domain/whatsapp-verificacao-webhook"
import { processarEventoWhatsapp } from "@/core/use-cases/processar-evento-whatsapp"

// Handler fino (ADR-0012, issues #155/#158): assinatura/roteamento/idempotência
// vivem no domínio/use-case; aqui só lê a requisição, agenda o processamento e
// devolve status. Runtime Node (padrão do Next) — `node:crypto` da assinatura
// não roda em Edge; o `after()` do processamento pesado também precisa de Node.

export function GET(request: Request): Response {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  // Sem o verify token configurado, não há como validar — fecha (403), nunca
  // abre: um `?? ""` aqui aceitaria qualquer challenge sem token nenhum.
  if (!verifyToken) return new Response(null, { status: 403 })

  const { searchParams } = new URL(request.url)
  const resultado = verificarChallengeWebhook(
    {
      mode: searchParams.get("hub.mode"),
      token: searchParams.get("hub.verify_token"),
      challenge: searchParams.get("hub.challenge"),
    },
    verifyToken,
  )

  return resultado.status === 200
    ? new Response(resultado.corpo, { status: 200 })
    : new Response(null, { status: 403 })
}

export async function POST(request: Request): Promise<Response> {
  const appSecret = process.env.META_APP_SECRET
  // Mesma lógica do GET: sem secret configurado, fecha — nunca cai pra uma
  // assinatura sobre chave vazia que qualquer corpo sem assinatura bateria.
  if (!appSecret) return new Response(null, { status: 403 })

  const corpoBruto = await request.text()
  const header = request.headers.get("x-hub-signature-256")

  if (!assinaturaValida(corpoBruto, header, appSecret)) {
    return new Response(null, { status: 403 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(corpoBruto)
  } catch (e) {
    // Assinatura ok mas corpo não-JSON: nada a processar — 200 e loga (a Meta
    // reentrega agressivamente em erro; não há o que reprocessar aqui).
    console.error("whatsapp: corpo do webhook não é JSON válido", e)
    return new Response(null, { status: 200 })
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? ""
  const messenger = httpWhatsappMessenger({
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken,
  })

  // Trabalho pesado (download da mídia + extração + matching + persistência) roda
  // PÓS-resposta: o webhook devolve 200 na hora — a Meta reentrega agressivo se
  // demorar — e o `after()` do Next 15 processa depois, no mesmo container, sem
  // fila (ADR-0012). Idempotência por `wa_message_id` protege a reentrega.
  after(async () => {
    try {
      await processarEventoWhatsapp(
        {
          userRepo: drizzleUserRepo(),
          eventRepo: drizzleWhatsappEventRepo(),
          messenger,
          // Fábrica preguiçosa: os adapters de R2/Bedrock (que leem env na
          // construção) só nascem quando chega um comprovante — texto/status não
          // quebram por env de mídia ausente.
          comprovante: () => ({
            mediaFetcher: httpWhatsappMediaFetcher({ accessToken }),
            extractor: bedrockReceiptExtractor(),
            billRepo: drizzleBillRepo(),
            paymentRepo: drizzlePaymentRepo(),
            proposalRepo: drizzleWhatsappProposalRepo(),
            store: r2AttachmentStore(),
            messenger,
            clock: systemClock(),
            calendar: nationalBankCalendar(),
          }),
        },
        payload,
      )
    } catch (e) {
      console.error("whatsapp: falha ao processar evento do webhook", e)
    }
  })

  return new Response(null, { status: 200 })
}
