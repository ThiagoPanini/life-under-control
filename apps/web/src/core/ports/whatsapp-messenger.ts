/**
 * Port de envio de mensagens WhatsApp (ADR-0012, issue #155). O adapter fino
 * fala com a Graph API; o eco de fase 0 usa só `enviarTexto`.
 */
export type WhatsappMessenger = {
  /** Envia texto livre pro número em E.164. */
  enviarTexto(para: string, corpo: string): Promise<void>
}
