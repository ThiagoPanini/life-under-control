import { mascararTelefone } from "../domain/log-mascarado"
import { normalizarTelefoneE164 } from "../domain/telefone"
import { classificarEventoWebhook, type EventoWebhook } from "../domain/whatsapp-evento"
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
  /** Injetável pro use-case não depender do `console` global direto; default é o próprio `console.log`. */
  log?: (mensagem: string) => void
}

type Mensagem = Extract<EventoWebhook, { tipo: "mensagem" }>

function ehMensagem(evento: EventoWebhook): evento is Mensagem {
  return evento.tipo === "mensagem"
}

async function processarMensagem(
  deps: Dependencias,
  log: (mensagem: string) => void,
  evento: Mensagem,
): Promise<void> {
  const reivindicado = await deps.eventRepo.reivindicar({
    waMessageId: evento.waMessageId,
    remetente: evento.remetente,
  })
  if (!reivindicado) {
    log(
      `whatsapp: evento ${evento.waMessageId} duplicado, ignorado (remetente ${mascararTelefone(evento.remetente)})`,
    )
    return
  }

  const telefoneE164 = normalizarTelefoneE164(evento.remetente)
  const pessoa = telefoneE164 ? await deps.userRepo.obterPorWhatsappPhone(telefoneE164) : null
  if (!pessoa) {
    log(
      `whatsapp: remetente ${mascararTelefone(evento.remetente)} não vinculado a nenhuma Pessoa, ignorado`,
    )
    return
  }

  if (evento.texto !== null) {
    await deps.messenger.enviarTexto(evento.remetente, TEXTO_INSTRUCAO_USO)
  }
}

export async function processarEventoWhatsapp(
  deps: Dependencias,
  payloadBruto: unknown,
): Promise<void> {
  const log = deps.log ?? console.log
  const mensagens = classificarEventoWebhook(payloadBruto).filter(ehMensagem)

  // Cada evento é independente — um evento no meio do lote falhando não pode
  // derrubar os outros; roda concorrente em vez de sequencial, já que a Meta
  // pode entregar vários numa mesma chamada.
  await Promise.all(
    mensagens.map(async (evento) => {
      try {
        await processarMensagem(deps, log, evento)
      } catch (e) {
        log(`whatsapp: falha ao processar evento ${evento.waMessageId}: ${e}`)
      }
    }),
  )
}
