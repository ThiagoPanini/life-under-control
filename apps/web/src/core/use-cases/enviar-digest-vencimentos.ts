import { mascararTelefone } from "../domain/log-mascarado"
import type { BillRepo } from "../ports/bill-repo"
import type { Calendar } from "../ports/calendar"
import type { Clock } from "../ports/clock"
import type { HouseholdRepo } from "../ports/household-repo"
import type { PaymentRepo } from "../ports/payment-repo"
import type { WhatsappEventRepo } from "../ports/whatsapp-event-repo"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"
import { derivarConteudoDigest } from "./derive-digest-vencimentos"

/** O template utility aprovado (#157) e seu idioma na Meta. */
export const TEMPLATE_DIGEST = "digest_vencimentos"
export const IDIOMA_DIGEST = "pt_BR"

export type DigestDeps = {
  householdRepo: HouseholdRepo
  billRepo: BillRepo
  paymentRepo: PaymentRepo
  eventRepo: WhatsappEventRepo
  messenger: WhatsappMessenger
  clock: Clock
  calendar: Calendar
  /** Injetável pro use-case não depender do `console` global; default é `console.log`. */
  log?: (mensagem: string) => void
}

export type ResultadoDigest =
  | { status: "sem-lar" }
  | { status: "nada-a-enviar" }
  | {
      status: "enviado"
      /** Templates de fato aceitos pela Meta. */
      enviados: number
      /** Pessoas cujo digest do dia já tinha sido enviado (dedup). */
      jaEnviados: number
      /** Envios que a Meta recusou — reivindicação liberada para o próximo disparo. */
      falhas: number
      /** Pessoas sem WhatsApp vinculado, puladas. */
      semTelefone: number
    }

/**
 * Chave sintética de dedup: um digest por dia por Pessoa (AC de #160). Reusa a
 * tabela de eventos do webhook (`whatsapp_events`) — o único fato persistido é
 * "um digest foi enviado a X no dia D", nunca estado de vencimento (invariante #3).
 */
function chaveDigest(hoje: string, telefone: string): string {
  return `digest:${hoje}:${telefone}`
}

/**
 * Envia o digest diário de vencimentos às duas Pessoas do Lar (#160, fase 2).
 * Deriva o conteúdo na hora de `derivarTiraAtencao` (sem estado persistido,
 * invariante #3; ADR-0012): Conta paga de manhã já não aparece no disparo da
 * tarde. Só envia quando alguma Conta pede atenção.
 *
 * Dedup por dia/Pessoa via `eventRepo`, com compensação: reivindica **antes** de
 * enviar (o índice único fecha a corrida de disparos concorrentes) e, se a Meta
 * recusar o template, **libera** a reivindicação — assim um novo disparo (ou
 * re-hit do endpoint) reenvia em vez de o dia ficar poisonado por um envio falho.
 */
export async function enviarDigestVencimentos(deps: DigestDeps): Promise<ResultadoDigest> {
  const log = deps.log ?? console.log

  const lar = await deps.householdRepo.carregarLar()
  if (!lar) {
    log("whatsapp: digest sem Lar, nada enviado")
    return { status: "sem-lar" }
  }

  const [bills, payments] = await Promise.all([
    deps.billRepo.listarBills(lar.id),
    deps.paymentRepo.listarTodosPayments(lar.id),
  ])

  // Uma única leitura do relógio: a derivação e a chave de dedup precisam do
  // MESMO dia, senão um disparo na virada da meia-noite keyaria a reivindicação
  // num dia diferente do conteúdo derivado (finding do review).
  const hoje = deps.clock.hoje()
  const clockFixo: Clock = { hoje: () => hoje }

  const conteudo = derivarConteudoDigest(clockFixo, deps.calendar, bills, payments)
  if (!conteudo.enviar) {
    log("whatsapp: digest sem Conta pedindo atenção, nada enviado")
    return { status: "nada-a-enviar" }
  }

  const params = [
    conteudo.params.vencidas,
    conteudo.params.venceEmBreve,
    conteudo.params.totalEstimado,
  ]

  let enviados = 0
  let jaEnviados = 0
  let falhas = 0
  let semTelefone = 0

  for (const pessoa of lar.pessoas) {
    const telefone = pessoa.whatsappPhone
    if (!telefone) {
      semTelefone += 1
      continue
    }

    const chave = chaveDigest(hoje, telefone)
    const reivindicado = await deps.eventRepo.reivindicar({
      waMessageId: chave,
      remetente: telefone,
    })
    if (!reivindicado) {
      jaEnviados += 1
      log(`whatsapp: digest de ${hoje} já enviado a ${mascararTelefone(telefone)}, ignorado`)
      continue
    }

    const entregue = await deps.messenger.enviarTemplate(telefone, {
      nome: TEMPLATE_DIGEST,
      idioma: IDIOMA_DIGEST,
      params,
    })
    if (!entregue) {
      // A Meta recusou: desfaz a reivindicação pra não poisonar o dia — o
      // próximo disparo tenta de novo (a menos que já tenha entregue depois).
      await deps.eventRepo.liberar({ waMessageId: chave })
      falhas += 1
      log(
        `whatsapp: envio do digest a ${mascararTelefone(telefone)} falhou, reivindicação liberada`,
      )
      continue
    }
    enviados += 1
  }

  return { status: "enviado", enviados, jaEnviados, falhas, semTelefone }
}
