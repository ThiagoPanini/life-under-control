/**
 * Port de download de mídia do WhatsApp (ADR-0012, issue #158). Resolve o
 * **media ID** do evento na Graph API (GET do media → URL efêmera → download
 * autenticado) e devolve os bytes. Nunca segue uma URL vinda do corpo do
 * webhook: o endpoint é público e isso abriria SSRF — o adapter só fala com a
 * Graph API com o access token. A URL efêmera expira em minutos, daí o download
 * ser imediato.
 */
export type MidiaBaixada = { conteudo: Uint8Array; tipoMime: string }

export type WhatsappMediaFetcher = {
  /**
   * Baixa os bytes da mídia pelo seu `mediaId`. `null` em falha (mídia sumiu,
   * URL efêmera expirada, rede fora) — a borda nunca lança; o use-case degrada
   * para "tente de novo mais tarde".
   */
  baixar(mediaId: string): Promise<MidiaBaixada | null>
}
