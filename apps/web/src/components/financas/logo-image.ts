/**
 * Normalização do logo de uma Conta na borda-cliente (#144). Antes de subir, a
 * imagem escolhida é redimensionada para caber num quadrado de ~512px e
 * recomprimida — o logo é decorativo e nunca precisa de mais que isso. É
 * best-effort: se o ambiente não tem `<canvas>`/`createImageBitmap` (SSR, node,
 * jsdom) ou algo falha, devolve o arquivo original e a validação de tamanho ainda
 * roda em cima dele. A regra de tipo/tamanho é a do domínio (`attachment.ts`) —
 * fonte única; aqui não se duplica limite.
 */

import { ehImagemAceita, validarLogo } from "@/core/domain/attachment"

/** Lado máximo (px) do logo normalizado — cabe no tile sem desperdiçar bytes. */
export const LADO_MAX_LOGO_PX = 512

const TIPO_SAIDA = "image/webp"
const QUALIDADE = 0.85

/**
 * Dimensões-alvo preservando a proporção: encolhe o lado maior até `maxLado` e
 * nunca amplia (imagem já menor sai igual). Função pura — o miolo testável da
 * normalização, independente de `<canvas>`.
 */
export function calcularDimensoesAlvo(
  largura: number,
  altura: number,
  maxLado = LADO_MAX_LOGO_PX,
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura)
  if (maior <= maxLado) return { largura, altura }
  const escala = maxLado / maior
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) }
}

/** Troca a extensão do nome do arquivo (o tipo mudou na recompressão). */
function trocarExtensao(nome: string, ext: string): string {
  return `${nome.replace(/\.[^./\\]+$/, "")}.${ext}`
}

/**
 * Redimensiona/recomprime a imagem no cliente. Degrada para o arquivo original
 * sempre que não puder (sem canvas, decode falhou, recompressão não ajudou).
 */
export async function normalizarImagemLogo(file: File): Promise<File> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file
    const bitmap = await createImageBitmap(file)
    const { largura, altura } = calcularDimensoesAlvo(bitmap.width, bitmap.height)
    const canvas = document.createElement("canvas")
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, TIPO_SAIDA, QUALIDADE),
    )
    if (!blob || blob.size >= file.size) return file // não piora um arquivo já enxuto
    return new File([blob], trocarExtensao(file.name, "webp"), { type: TIPO_SAIDA })
  } catch {
    return file
  }
}

export type ResultadoArquivoLogo = { ok: true; file: File } | { ok: false; erro: string }

/**
 * Prepara o arquivo escolhido para virar logo: barra tipo não-imagem/SVG antes de
 * tentar decodificar, normaliza no cliente e revalida tamanho contra o teto do
 * domínio. Devolve o arquivo já normalizado ou a mensagem de erro (com o limite).
 */
export async function prepararArquivoLogo(file: File): Promise<ResultadoArquivoLogo> {
  if (!ehImagemAceita(file.type)) return { ok: false, erro: "Envie uma imagem." }
  const normalizado = await normalizarImagemLogo(file)
  const erros = validarLogo(normalizado.type, normalizado.size)
  if (erros.length > 0) return { ok: false, erro: erros[0]?.mensagem ?? "Arquivo inválido." }
  return { ok: true, file: normalizado }
}
