import type { BotaoInterativo } from "../domain/payment-proposal"

/**
 * Port de envio de mensagens WhatsApp (ADR-0012, issues #155/#158). O adapter
 * fino fala com a Graph API; o eco de fase 0 usa só `enviarTexto`, a Proposta de
 * Lançamento (#158) responde com `enviarBotoes`.
 */
export type WhatsappMessenger = {
  /** Envia texto livre pro número em E.164. */
  enviarTexto(para: string, corpo: string): Promise<void>
  /**
   * Envia uma mensagem com botões de resposta rápida (a Proposta: Confirmar /
   * Trocar Conta / Cancelar). A Graph API aceita no máximo 3 botões.
   */
  enviarBotoes(para: string, corpo: string, botoes: BotaoInterativo[]): Promise<void>
}
