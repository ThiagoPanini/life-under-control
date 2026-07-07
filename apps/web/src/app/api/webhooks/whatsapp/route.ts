import { drizzleUserRepo } from "@/adapters/db/user-repo.drizzle"
import { drizzleWhatsappEventRepo } from "@/adapters/db/whatsapp-event-repo.drizzle"
import { httpWhatsappMessenger } from "@/adapters/http/whatsapp-messenger"
import { assinaturaValida } from "@/core/domain/whatsapp-assinatura"
import { verificarChallengeWebhook } from "@/core/domain/whatsapp-verificacao-webhook"
import { processarEventoWhatsapp } from "@/core/use-cases/processar-evento-whatsapp"

// Handler fino (ADR-0012, issue #155): assinatura/roteamento/idempotência
// vivem no domínio/use-case; aqui só lê a requisição, chama e devolve status.
// Runtime Node (padrão do Next) — `node:crypto` da assinatura não roda em Edge.

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

  try {
    const payload = JSON.parse(corpoBruto)
    await processarEventoWhatsapp(
      {
        userRepo: drizzleUserRepo(),
        eventRepo: drizzleWhatsappEventRepo(),
        messenger: httpWhatsappMessenger({
          phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
          accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
        }),
      },
      payload,
    )
  } catch (e) {
    // A Meta reentrega agressivamente em erro — 200 sempre, e loga pra investigar depois.
    console.error("whatsapp: falha ao processar evento do webhook", e)
  }

  return new Response(null, { status: 200 })
}
