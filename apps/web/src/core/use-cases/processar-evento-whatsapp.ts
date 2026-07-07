import { mascararTelefone } from "../domain/log-mascarado"
import { normalizarTelefoneE164 } from "../domain/telefone"
import { classificarEventoWebhook } from "../domain/whatsapp-evento"
import type { UserRepo } from "../ports/user-repo"
import type { WhatsappEventRepo } from "../ports/whatsapp-event-repo"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"

/**
 * Orquestração do webhook (ADR-0012, issue #155): idempotência por
 * `wa_message_id`, resolução do remetente pela Pessoa vinculada (#152) e o
 * eco de fase 0 — só mensagens de texto de remetente vinculado recebem
 * resposta; o resto é ignorado em silêncio (log mascarado).
 */

export const TEXTO_INSTRUCAO_USO =
  "Oi! Em breve vou ajudar a registrar seus comprovantes automaticamente por aqui."

type Dependencias = {
  userRepo: UserRepo
  eventRepo: WhatsappEventRepo
  messenger: WhatsappMessenger
}

export async function processarEventoWhatsapp(
  deps: Dependencias,
  payloadBruto: unknown,
): Promise<void> {
  const eventos = classificarEventoWebhook(payloadBruto)

  for (const evento of eventos) {
    if (evento.tipo !== "mensagem") continue

    if (await deps.eventRepo.jaProcessado(evento.waMessageId)) {
      console.log(
        `whatsapp: evento ${evento.waMessageId} duplicado, ignorado (remetente ${mascararTelefone(evento.remetente)})`,
      )
      continue
    }

    const telefoneE164 = normalizarTelefoneE164(evento.remetente)
    const pessoa = telefoneE164 ? await deps.userRepo.obterPorWhatsappPhone(telefoneE164) : null
    if (!pessoa) {
      console.log(
        `whatsapp: remetente ${mascararTelefone(evento.remetente)} não vinculado a nenhuma Pessoa, ignorado`,
      )
      await deps.eventRepo.registrar({
        waMessageId: evento.waMessageId,
        remetente: evento.remetente,
      })
      continue
    }

    if (evento.texto !== null) {
      await deps.messenger.enviarTexto(evento.remetente, TEXTO_INSTRUCAO_USO)
    }
    await deps.eventRepo.registrar({ waMessageId: evento.waMessageId, remetente: evento.remetente })
  }
}
