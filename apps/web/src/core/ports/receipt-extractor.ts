import type { ReciboWhatsapp } from "@/core/domain/recibo-whatsapp"

/**
 * Port de extração de comprovante (ADR-0013). Recebe os bytes do documento e seu
 * MIME (`image/*` ou `application/pdf`) e devolve o `ReciboWhatsapp` legível — o
 * LLM **só extrai**, não decide: matching de Conta, Competência e criação de fato
 * ficam no núcleo determinístico (#162, #158). A borda injeta o adapter real
 * (Claude no Bedrock); os use-cases usam um fake, sem rede. Quem consome valida o
 * retorno com `parseReciboWhatsapp` — o núcleo não confia no adapter.
 */
export type ReceiptExtractor = (conteudo: Uint8Array, tipoMime: string) => Promise<ReciboWhatsapp>
