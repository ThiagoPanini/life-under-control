/**
 * Recibo extraído da imagem do comprovante do WhatsApp (ADR-0013) — o shape que
 * o port `ReceiptExtractor` (#156) devolve. Campo nulo = ilegível na extração;
 * nunca um palpite (ADR-0013). Distinto de `ReciboExtraido` (backfill.ts): aquele
 * é a ingestão em lote do histórico (arquivo/competencia/tipoMime); este é o
 * comprovante avulso do WhatsApp, com `favorecido` e `valorCentavos`.
 */
export type ReciboWhatsapp = {
  valorCentavos: number | null
  dataPagamento: string | null
  favorecido: string | null
  vencimentoImpresso: string | null
  mesReferenciaImpresso: string | null
}
