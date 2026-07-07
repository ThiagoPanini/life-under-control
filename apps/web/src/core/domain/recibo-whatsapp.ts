import { ehCompetenciaValida, ehDataIsoValida } from "./bill"

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

/** Dinheiro é exato (invariante #6): inteiro em centavos, > 0. Nulo = ilegível. */
function validarValor(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new Error(`valor do recibo inválido: esperado inteiro em centavos > 0, recebido ${v}`)
  }
  return v
}

function validarData(v: unknown, campo: string): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "string" || !ehDataIsoValida(v)) {
    throw new Error(
      `${campo} inválido: esperado data ISO YYYY-MM-DD, recebido ${JSON.stringify(v)}`,
    )
  }
  return v
}

function validarMes(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "string" || !ehCompetenciaValida(v)) {
    throw new Error(`mês de referência inválido: esperado YYYY-MM, recebido ${JSON.stringify(v)}`)
  }
  return v
}

/** Espaço em branco não é sinal legível → null (não vira palpite). */
function normalizarFavorecido(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "string") {
    throw new Error(`favorecido inválido: esperado texto, recebido ${JSON.stringify(v)}`)
  }
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * Valida o recibo bruto que o adapter (`ReceiptExtractor`) devolve — o núcleo
 * **não confia** no LLM (ADR-0013): centavos inteiros > 0, datas ISO reais. Campo
 * ilegível chega `null` e é preservado; "ilegível" jamais vira palpite (invariante
 * #3 do CONTEXT.md). Lança em valor fora do domínio; nunca "conserta" em silêncio.
 */
export function parseReciboWhatsapp(bruto: unknown): ReciboWhatsapp {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    throw new Error("recibo extraído inválido: esperado objeto")
  }
  const r = bruto as Record<string, unknown>
  return {
    valorCentavos: validarValor(r.valorCentavos),
    dataPagamento: validarData(r.dataPagamento, "dataPagamento"),
    favorecido: normalizarFavorecido(r.favorecido),
    vencimentoImpresso: validarData(r.vencimentoImpresso, "vencimentoImpresso"),
    mesReferenciaImpresso: validarMes(r.mesReferenciaImpresso),
  }
}
