/**
 * Port do object storage dos Anexos (ADR-0003 + ADR-0008). O núcleo nunca fala
 * com o R2 direto: assina URLs e apaga objetos por esta interface; o adapter
 * concreto envolve o R2 (S3-compatível) e os testes usam um fake — sem rede. O
 * upload é por **URL assinada**: o navegador sobe os bytes direto pro bucket, sem
 * trafegar pelo app. A chave é derivada no domínio (`chaveComprovante`).
 */
export type AttachmentStore = {
  /** URL assinada de **PUT** — o navegador sobe os bytes direto pro R2 (expira). */
  urlDeUpload(chave: string, tipoMime: string): Promise<string>
  /**
   * Sobe bytes direto pro bucket, **server-side** (sem navegador). É o caminho da
   * ingestão histórica (backfill, #24): o app lê o comprovante do disco do operador
   * e o põe no R2 sem URL assinada. Sobrescreve a mesma chave — idempotente.
   */
  enviar(chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void>
  /** URL assinada de **GET** — resgatar (abrir/baixar) o comprovante (expira). */
  urlDeLeitura(chave: string): Promise<string>
  /**
   * Lê os metadados **reais** do objeto no bucket (tamanho/tipo que de fato
   * subiram); `null` se o objeto não existe. É o que torna a confirmação honesta:
   * persistir o fato observado no R2, não o que o cliente declarou (CONTEXT.md #3).
   */
  metadados(chave: string): Promise<{ tamanhoBytes: number; tipoMime: string } | null>
  /** Apaga o objeto do bucket (remoção/substituição de um comprovante). */
  remover(chave: string): Promise<void>
}
