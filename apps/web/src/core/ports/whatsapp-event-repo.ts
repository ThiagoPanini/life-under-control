/**
 * Port da tabela de eventos da borda do webhook (ADR-0012, issue #155) —
 * idempotência por `wa_message_id` e log auditável.
 */
export type WhatsappEventRepo = {
  /** `true` se esse `wa_message_id` já foi registrado antes. */
  jaProcessado(waMessageId: string): Promise<boolean>
  /** Grava o evento processado (idempotente — reentrada no mesmo id não duplica). */
  registrar(evento: { waMessageId: string; remetente: string }): Promise<void>
}
