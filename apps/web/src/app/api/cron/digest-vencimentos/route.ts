import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { drizzleWhatsappEventRepo } from "@/adapters/db/whatsapp-event-repo.drizzle"
import { whatsappMessengerFromEnv } from "@/adapters/http/whatsapp-messenger"
import { segredoDigestValido } from "@/core/domain/digest-auth"
import { enviarDigestVencimentos } from "@/core/use-cases/enviar-digest-vencimentos"

// Handler fino (ADR-0012, issue #160): a auth por segredo e a derivação vivem no
// domínio/use-case; aqui só valida o segredo, monta os adapters e dispara. Gatilho
// = scheduled task do Coolify às 08:00 America/Sao_Paulo (`0 11 * * *` em UTC).
// Runtime Node (padrão do Next): `node:crypto` da comparação de segredo e os
// adapters Drizzle (pg) não rodam em Edge.

export async function POST(request: Request): Promise<Response> {
  // Fail-closed: sem o segredo configurado, ou header errado/ausente → 401.
  // Nunca abre sobre segredo vazio (mesma disciplina do webhook, #155).
  if (!segredoDigestValido(request.headers.get("authorization"), process.env.DIGEST_CRON_SECRET)) {
    return new Response(null, { status: 401 })
  }

  const resultado = await enviarDigestVencimentos({
    householdRepo: drizzleHouseholdRepo(),
    billRepo: drizzleBillRepo(),
    paymentRepo: drizzlePaymentRepo(),
    eventRepo: drizzleWhatsappEventRepo(),
    messenger: whatsappMessengerFromEnv(),
    clock: systemClock(),
    calendar: nationalBankCalendar(),
  })

  return Response.json(resultado)
}
