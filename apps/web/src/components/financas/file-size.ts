/**
 * Tamanho de arquivo legível no chip de comprovante do modal compacto (#100),
 * na forma do protótipo Final (`fmtTam`): bytes crus, KB inteiro, MB com uma
 * casa e vírgula pt-BR. Apresentação de borda — nada de domínio aqui.
 */
export function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB`
}
