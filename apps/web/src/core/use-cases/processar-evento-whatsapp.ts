import { mascararTelefone } from "../domain/log-mascarado"
import { normalizarTelefoneE164 } from "../domain/telefone"
import { classificarEventoWebhook, type EventoWebhook } from "../domain/whatsapp-evento"
import type { UserRepo } from "../ports/user-repo"
import type { WhatsappEventRepo } from "../ports/whatsapp-event-repo"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"
import { type ComprovanteDeps, proporLancamentoComprovante } from "./propor-lancamento-comprovante"

/**
 * Orquestração do webhook (ADR-0012, issues #155/#158): idempotência por
 * `wa_message_id`, resolução do remetente pela Pessoa vinculada (#152) e o
 * roteamento por tipo de mensagem — comprovante (imagem/PDF) vira Proposta de
 * Lançamento (#158, pipeline `comprovante`); texto recebe o eco de instrução; o
 * resto é ignorado em silêncio (log mascarado).
 */

export const TEXTO_INSTRUCAO_USO =
  "Oi! Manda a foto ou o PDF do comprovante que eu registro o pagamento pra vocês. 📎"

type Dependencias = {
  userRepo: UserRepo
  eventRepo: WhatsappEventRepo
  messenger: WhatsappMessenger
  /**
   * Fábrica do pipeline do comprovante (#158); ausente = borda só de texto (fase
   * 0). É uma fábrica (não o bundle pronto) pra construção **preguiçosa**: os
   * adapters de R2/Bedrock só nascem quando chega um comprovante — um evento de
   * texto/status nunca falha por env de mídia ausente.
   */
  comprovante?: () => ComprovanteDeps
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

  // Comprovante (imagem/PDF) → Proposta de Lançamento (#158). Roteia antes do
  // texto: a mensagem de mídia tem `texto` nulo e `midia` preenchida.
  if (evento.midia !== null) {
    if (!deps.comprovante) {
      log(`whatsapp: comprovante recebido sem pipeline configurado (evento ${evento.waMessageId})`)
      return
    }
    if (!pessoa.householdId) {
      log(`whatsapp: Pessoa ${pessoa.id} sem Lar resolvido — comprovante ignorado`)
      return
    }
    await proporLancamentoComprovante(deps.comprovante(), {
      householdId: pessoa.householdId,
      paidBy: pessoa.id,
      remetente: evento.remetente,
      waMessageId: evento.waMessageId,
      midia: evento.midia,
    })
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
