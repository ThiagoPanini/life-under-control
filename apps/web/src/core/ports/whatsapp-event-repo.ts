/**
 * Port da tabela de eventos da borda do webhook (ADR-0012, issue #155) —
 * idempotência por `wa_message_id` e log auditável.
 */
export type WhatsappEventRepo = {
  /**
   * Reivindica o processamento do evento — `true` na primeira vez (grava),
   * `false` se `wa_message_id` já foi reivindicado antes. Atômico: sob
   * reentrega concorrente, só uma chamada devolve `true` (o índice único no
   * banco decide, não uma leitura seguida de escrita).
   */
  reivindicar(evento: { waMessageId: string; remetente: string }): Promise<boolean>
}
