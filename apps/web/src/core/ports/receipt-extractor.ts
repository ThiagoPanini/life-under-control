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

/**
 * Os MIME que o extrator consegue ler: as imagens que a visão do Claude aceita
 * (sem SVG/HEIC) e PDF. Fonte única — o adapter rejeita cedo o que não está aqui
 * e a borda (issue #158) pré-checa **antes** de extrair, pra distinguir "tipo não
 * suportado" (permanente: pedir outro formato) de falha transitória (pedir reenvio).
 */
export const MIMES_COMPROVANTE_SUPORTADOS: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
])

/** O extrator consegue ler este tipo de arquivo? (imagem aceita pelo Claude ou PDF). */
export function ehMimeComprovanteSuportado(tipoMime: string): boolean {
  return MIMES_COMPROVANTE_SUPORTADOS.has(tipoMime)
}
