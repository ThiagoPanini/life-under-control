/**
 * Anexo (`Attachment`) — núcleo puro (ADR-0003). O comprovante de um Lançamento
 * (ADR-0008): os *bytes* vivem no object storage (R2, atrás do port
 * `AttachmentStore`); aqui mora só a forma de domínio dos **metadados** (nome,
 * tipo, tamanho, chave no bucket, quem subiu, quando) e as regras puras —
 * validação do arquivo e a derivação da chave. Nada de Drizzle, Next, React nem
 * SDK de storage; nenhuma rede. O Anexo é opcional e múltiplo por Lançamento, e
 * imutável após o upload (um Registro fotografa, não se reescreve — CONTEXT.md #4).
 */

import type { ErroCampo } from "./bill"

/** Tamanho máximo de um comprovante (25 MB) — um recibo cabe folgado; barra o absurdo. */
export const TAMANHO_MAX_BYTES = 25 * 1024 * 1024

/**
 * Teto do logo de uma Conta (5 MB) — bem mais apertado que o do comprovante: o
 * logo é decorativo e ainda é normalizado no cliente (redimensionado até ~512px)
 * antes de subir, então 5 MB já é folga de sobra.
 */
export const TAMANHO_MAX_LOGO_BYTES = 5 * 1024 * 1024

/** Os metadados de um Anexo já validados (a forma normalizada do arquivo). */
export type DadosAttachment = {
  /** Nome do arquivo como a Pessoa o subiu (para exibir e baixar). */
  nomeOriginal: string
  /** Tipo MIME declarado — imagem (`image/*`) ou PDF (`application/pdf`). */
  tipoMime: string
  /** Tamanho em bytes (inteiro positivo). */
  tamanhoBytes: number
}

/**
 * Um Anexo persistido: os metadados + identidade, o Lar dono, o Lançamento a que
 * pertence, a chave no bucket R2, quem subiu (autoria, não permissão — #1) e
 * quando. A chave é o endereço dos bytes no storage; o domínio a deriva, o
 * adapter R2 a usa.
 */
export type Attachment = DadosAttachment & {
  id: string
  householdId: string
  paymentId: string
  chaveR2: string
  uploadedBy: string
  /** Instante do upload (ISO-8601) — quando, fato persistido. */
  criadoEm: string
}

/** Entrada crua do anexo (a borda traduz o arquivo escolhido nisto). */
export type AttachmentBruto = {
  nomeOriginal: string
  tipoMime: string
  /** Bytes informados pela borda; `NaN` quando não veio um número. */
  tamanhoBytes: number
}

export type ValidacaoAttachment =
  | { ok: true; value: DadosAttachment }
  | { ok: false; erros: ErroCampo[] }

/**
 * É um tipo de comprovante aceito (imagem ou PDF)? SVG fica de fora de propósito:
 * é imagem mas carrega script e, servido inline da origem do R2, abre vetor de
 * injeção de conteúdo — um recibo nunca é SVG, então não há perda real.
 */
export function ehTipoComprovanteAceito(tipoMime: string): boolean {
  if (tipoMime === "application/pdf") return true
  if (tipoMime === "image/svg+xml") return false
  return tipoMime.startsWith("image/")
}

/**
 * Valida e normaliza os metadados de um comprovante. Fonte única da regra: os
 * use-cases de upload consomem isto. Exige nome não vazio, tipo aceito (imagem
 * ou PDF) e tamanho inteiro positivo dentro do teto. Erros saem por campo (no
 * campo único `arquivo`), no mesmo formato da baixa.
 */
/**
 * Tamanho inteiro positivo dentro do teto — a regra que todo upload comparte. O
 * teto (e o rótulo dele na mensagem) é parâmetro: o comprovante usa 25 MB, o logo
 * usa 5 MB. Assim a mensagem sempre traz o limite real que foi violado.
 */
function validarTamanhoArquivo(
  tamanhoBytes: number,
  maxBytes = TAMANHO_MAX_BYTES,
  limiteRotulo = "25 MB",
): ErroCampo[] {
  if (typeof tamanhoBytes !== "number" || !Number.isInteger(tamanhoBytes) || tamanhoBytes <= 0)
    return [{ campo: "arquivo", mensagem: "Arquivo vazio ou inválido." }]
  if (tamanhoBytes > maxBytes)
    return [{ campo: "arquivo", mensagem: `Arquivo maior que ${limiteRotulo}.` }]
  return []
}

export function validarDadosAttachment(bruto: AttachmentBruto): ValidacaoAttachment {
  const erros: ErroCampo[] = []

  const nomeOriginal = (bruto.nomeOriginal ?? "").trim()
  if (nomeOriginal === "") erros.push({ campo: "arquivo", mensagem: "Selecione um arquivo." })

  const tipoMime = (bruto.tipoMime ?? "").trim()
  if (!ehTipoComprovanteAceito(tipoMime))
    erros.push({ campo: "arquivo", mensagem: "Tipo não suportado — envie uma imagem ou um PDF." })

  erros.push(...validarTamanhoArquivo(bruto.tamanhoBytes))

  if (erros.length > 0) return { ok: false, erros }
  return { ok: true, value: { nomeOriginal, tipoMime, tamanhoBytes: bruto.tamanhoBytes } }
}

/**
 * É um tipo de imagem aceito pro logo de uma Conta — mais estrito que o
 * comprovante (que também aceita PDF): aqui só imagem de verdade, sem SVG (o
 * mesmo risco de conteúdo ativo do comprovante).
 */
export function ehImagemAceita(tipoMime: string): boolean {
  if (tipoMime === "image/svg+xml") return false
  return tipoMime.startsWith("image/")
}

/**
 * Valida um logo de Conta: teto próprio, mais apertado (`TAMANHO_MAX_LOGO_BYTES`,
 * 5 MB), e só aceita imagem — sem PDF. Sem nome: o logo é decorativo, não um
 * documento a rotular (diferente do comprovante).
 */
export function validarLogo(tipoMime: string, tamanhoBytes: number): ErroCampo[] {
  const erros: ErroCampo[] = []

  const tipoMimeTrim = (tipoMime ?? "").trim()
  if (!ehImagemAceita(tipoMimeTrim)) erros.push({ campo: "arquivo", mensagem: "Envie uma imagem." })

  erros.push(...validarTamanhoArquivo(tamanhoBytes, TAMANHO_MAX_LOGO_BYTES, "5 MB"))

  return erros
}

/**
 * Prefixo dos comprovantes no bucket compartilhado: a Área (`finance`) e o
 * primitivo (`payments`, o Lançamento). Namespeia a raiz do bucket por Área para
 * as próximas fases não colidirem (ADR-0006) e espelha a pasta provisionada no R2.
 */
const PREFIXO_COMPROVANTE = "finance/payments"

/**
 * Deriva a chave de um comprovante no bucket R2:
 * `finance/payments/{lar}/{lançamento}/{anexo}`. O prefixo da Área isola o bucket
 * compartilhado; dentro dele o Lar prefixa tudo (invariante de escopo, #1) e o
 * Lançamento agrupa seus anexos. É a única fonte da chave — prepare (assina o
 * upload) e confirm (persiste) a derivam igual a partir dos mesmos ids, então a
 * borda nunca a inventa.
 */
export function chaveComprovante(
  householdId: string,
  paymentId: string,
  attachmentId: string,
): string {
  return `${PREFIXO_COMPROVANTE}/${householdId}/${paymentId}/${attachmentId}`
}
