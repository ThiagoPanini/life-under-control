import { mascararTelefone } from "../domain/log-mascarado"
import { parsearAcaoBotao } from "../domain/payment-proposal"
import { normalizarTelefoneE164 } from "../domain/telefone"
import { classificarEventoWebhook, type EventoWebhook } from "../domain/whatsapp-evento"
import type { UserRepo } from "../ports/user-repo"
import type { WhatsappEventRepo } from "../ports/whatsapp-event-repo"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"
import {
  type ComprovanteDeps,
  proporLancamentoComprovante,
  TEXTO_TENTE_DE_NOVO,
} from "./propor-lancamento-comprovante"
import {
  type ResponderDeps,
  responderProposta,
  varrerPropostasExpiradas,
} from "./responder-proposta"

/**
 * Orquestração do webhook (ADR-0012, issues #155/#158): idempotência por
 * `wa_message_id`, resolução do remetente pela Pessoa vinculada (#152) e o
 * roteamento por tipo de mensagem — comprovante (imagem/PDF) vira Proposta de
 * Lançamento (#158, pipeline `comprovante`); texto recebe o eco de instrução; o
 * resto é ignorado em silêncio (log mascarado).
 */

export const TEXTO_INSTRUCAO_USO =
  "Oi! Manda a foto ou o PDF do comprovante que eu registro o pagamento pra vocês. 📎"

/** Falha inesperada ao responder um toque de botão da Proposta (#159): o evento já foi reivindicado (a Meta não reenvia) — avisa em vez de deixar o casal no vácuo. */
export const MENSAGEM_FALHA_INTERACAO =
  "Algo deu errado ao processar sua resposta. Tenta de novo daqui a pouco. 🙏"

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
  /**
   * Fábrica do pipeline de resposta aos botões da Proposta (#159); ausente = borda
   * sem Confirmar/Trocar/Cancelar. Preguiçosa como `comprovante` — adapters de
   * R2/Bedrock só nascem quando chega uma interação.
   */
  responder?: () => ResponderDeps
  /**
   * Fábrica leve da varredura oportunista de Propostas expiradas (#159) — só
   * repo/store/clock, sem Bedrock. Roda pós-processamento; ausente = sem varredura.
   */
  varredura?: () => Parameters<typeof varrerPropostasExpiradas>[0]
  /** Injetável pro use-case não depender do `console` global direto; default é o próprio `console.log`. */
  log?: (mensagem: string) => void
}

type Mensagem = Extract<EventoWebhook, { tipo: "mensagem" }>
type Interacao = Extract<EventoWebhook, { tipo: "interactive" }>
type PessoaVinculada = NonNullable<Awaited<ReturnType<UserRepo["obterPorWhatsappPhone"]>>>

/**
 * Idempotência + resolução do remetente, comum à mensagem e à interação (#158/#159):
 * reivindica o `wa_message_id` (dedup, fecha a corrida de entregas concorrentes da
 * Meta) e resolve a Pessoa vinculada pelo telefone. Devolve a Pessoa (o Lar pode
 * ainda ser nulo — só o comprovante/interação exige, cada chamador decide), ou
 * `null` já tendo logado o motivo (duplicado ou remetente não vinculado).
 */
async function reivindicarEResolverPessoa(
  deps: Dependencias,
  log: (mensagem: string) => void,
  evento: Mensagem | Interacao,
): Promise<PessoaVinculada | null> {
  const reivindicado = await deps.eventRepo.reivindicar({
    waMessageId: evento.waMessageId,
    remetente: evento.remetente,
  })
  if (!reivindicado) {
    log(`whatsapp: evento ${evento.waMessageId} duplicado, ignorado`)
    return null
  }

  const telefoneE164 = normalizarTelefoneE164(evento.remetente)
  const pessoa = telefoneE164 ? await deps.userRepo.obterPorWhatsappPhone(telefoneE164) : null
  if (!pessoa) {
    log(
      `whatsapp: remetente ${mascararTelefone(evento.remetente)} não vinculado a nenhuma Pessoa, ignorado`,
    )
    return null
  }
  return pessoa
}

async function processarMensagem(
  deps: Dependencias,
  log: (mensagem: string) => void,
  evento: Mensagem,
): Promise<void> {
  const pessoa = await reivindicarEResolverPessoa(deps, log, evento)
  if (!pessoa) return

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
    // O evento já foi reivindicado (a Meta não reenvia): um throw inesperado no
    // pipeline (ex.: `obterAtivaPorHash` com o banco fora — fora dos caminhos que
    // já degradam lá dentro) deixaria o comprovante sem resposta e sem retry. A
    // rede de segurança da borda responde "tente de novo" em vez do vácuo.
    try {
      await proporLancamentoComprovante(deps.comprovante(), {
        householdId: pessoa.householdId,
        paidBy: pessoa.id,
        remetente: evento.remetente,
        waMessageId: evento.waMessageId,
        midia: evento.midia,
      })
    } catch (e) {
      log(`whatsapp: falha inesperada no comprovante ${evento.waMessageId}: ${e}`)
      try {
        await deps.messenger.enviarTexto(evento.remetente, TEXTO_TENTE_DE_NOVO)
      } catch (e2) {
        log(`whatsapp: falha ao avisar erro do comprovante ${evento.waMessageId}: ${e2}`)
      }
    }
    return
  }

  if (evento.texto !== null) {
    await deps.messenger.enviarTexto(evento.remetente, TEXTO_INSTRUCAO_USO)
  }
}

/**
 * Resposta a um botão/linha da Proposta (#159): mesma idempotência e resolução de
 * Pessoa da mensagem, depois roteia a ação (`parsearAcaoBotao`) para o use-case.
 * Id irreconhecível é ignorado em silêncio (nunca chuta uma ação sobre o dado).
 */
async function processarInteracao(
  deps: Dependencias,
  log: (mensagem: string) => void,
  evento: Interacao,
): Promise<void> {
  const pessoa = await reivindicarEResolverPessoa(deps, log, evento)
  if (!pessoa) return
  if (!deps.responder) {
    log(`whatsapp: interação recebida sem pipeline configurado (evento ${evento.waMessageId})`)
    return
  }
  if (!pessoa.householdId) {
    log(`whatsapp: Pessoa ${pessoa.id} sem Lar resolvido — interação ignorada`)
    return
  }

  const acao = parsearAcaoBotao(evento.replyId)
  if (!acao) {
    log(`whatsapp: id de botão irreconhecível "${evento.replyId}" — ignorado`)
    return
  }

  try {
    await responderProposta(deps.responder(), {
      householdId: pessoa.householdId,
      remetente: evento.remetente,
      acao,
    })
  } catch (e) {
    // O evento já foi reivindicado (a Meta não reenvia) e o casal tocou um botão
    // esperando resposta — não deixa no vácuo. Aviso best-effort; se ele falhar
    // também, só resta o log (o outer catch nem chega a ver).
    log(`whatsapp: falha ao responder interação ${evento.waMessageId}: ${e}`)
    try {
      await deps.messenger.enviarTexto(evento.remetente, MENSAGEM_FALHA_INTERACAO)
    } catch (e2) {
      log(`whatsapp: falha ao avisar erro da interação ${evento.waMessageId}: ${e2}`)
    }
  }
}

export async function processarEventoWhatsapp(
  deps: Dependencias,
  payloadBruto: unknown,
): Promise<void> {
  const log = deps.log ?? console.log
  const eventos = classificarEventoWebhook(payloadBruto)

  // Cada evento é independente — um evento no meio do lote falhando não pode
  // derrubar os outros; roda concorrente, já que a Meta pode entregar vários
  // numa mesma chamada. Mensagem (texto/comprovante) e interação (botão) são as
  // duas famílias acionáveis; o resto é ignorado.
  const acionaveis = eventos.filter((e) => e.tipo === "mensagem" || e.tipo === "interactive")
  await Promise.all(
    acionaveis.map(async (evento) => {
      try {
        if (evento.tipo === "mensagem") await processarMensagem(deps, log, evento)
        else await processarInteracao(deps, log, evento)
      } catch (e) {
        log(`whatsapp: falha ao processar evento ${evento.waMessageId}: ${e}`)
      }
    }),
  )

  // Varredura oportunista de Propostas expiradas (#159), pós-resposta e
  // best-effort. Piggyback em atividade **humana** (mensagem/botão): um webhook só
  // de `status`/`template` — que a Meta dispara a cada mensagem que o bot envia, em
  // alta frequência — não vira um SELECT de limpeza. Sem tráfego acionável, sem
  // varredura; uma falha aqui não derruba o handler (o evento já foi respondido).
  if (deps.varredura && acionaveis.length > 0) {
    try {
      await varrerPropostasExpiradas(deps.varredura())
    } catch (e) {
      log(`whatsapp: falha na varredura de Propostas expiradas: ${e}`)
    }
  }
}
