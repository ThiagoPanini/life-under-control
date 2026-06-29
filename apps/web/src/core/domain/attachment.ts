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
export function validarDadosAttachment(bruto: AttachmentBruto): ValidacaoAttachment {
  const erros: ErroCampo[] = []

  const nomeOriginal = (bruto.nomeOriginal ?? "").trim()
  if (nomeOriginal === "") erros.push({ campo: "arquivo", mensagem: "Selecione um arquivo." })

  const tipoMime = (bruto.tipoMime ?? "").trim()
  if (!ehTipoComprovanteAceito(tipoMime))
    erros.push({ campo: "arquivo", mensagem: "Tipo não suportado — envie uma imagem ou um PDF." })

  const tamanhoBytes = bruto.tamanhoBytes
  if (typeof tamanhoBytes !== "number" || !Number.isInteger(tamanhoBytes) || tamanhoBytes <= 0)
    erros.push({ campo: "arquivo", mensagem: "Arquivo vazio ou inválido." })
  else if (tamanhoBytes > TAMANHO_MAX_BYTES)
    erros.push({ campo: "arquivo", mensagem: "Arquivo maior que 25 MB." })

  if (erros.length > 0) return { ok: false, erros }
  return { ok: true, value: { nomeOriginal, tipoMime, tamanhoBytes } }
}

/**
 * Deriva a chave de um comprovante no bucket R2: `{lar}/{lançamento}/{anexo}`. O
 * Lar prefixa tudo (invariante de escopo, #1) e o Lançamento agrupa seus anexos.
 * É a única fonte da chave — prepare (assina o upload) e confirm (persiste) a
 * derivam igual a partir dos mesmos ids, então a borda nunca a inventa.
 */
export function chaveComprovante(
  householdId: string,
  paymentId: string,
  attachmentId: string,
): string {
  return `${householdId}/${paymentId}/${attachmentId}`
}
