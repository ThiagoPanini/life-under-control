import { parseReciboWhatsapp, type ReciboWhatsapp } from "@/core/domain/recibo-whatsapp"
import type { ReceiptExtractor } from "@/core/ports/receipt-extractor"

/**
 * Fake do `ReceiptExtractor` para os use-cases (ADR-0013): devolve um
 * `ReciboWhatsapp` scriptado sem tocar rede nem Bedrock. Por padrão tudo é `null`
 * (ilegível); o teste sobrescreve só os campos que o cenário exige. Ignora bytes
 * e MIME — o que importa a jusante é o recibo extraído, não como se leu.
 *
 * O scriptado passa por `parseReciboWhatsapp` — o mesmo guarda que o adapter real
 * aplica —, então o fake nunca emite um recibo que a produção rejeitaria (um
 * teste que scripte valor/data inválidos falha alto, não passa verde enganoso).
 */
export function fakeReceiptExtractor(recibo: Partial<ReciboWhatsapp> = {}): ReceiptExtractor {
  const extraido = parseReciboWhatsapp({
    valorCentavos: null,
    dataPagamento: null,
    favorecido: null,
    vencimentoImpresso: null,
    mesReferenciaImpresso: null,
    ...recibo,
  })
  return async () => extraido
}
