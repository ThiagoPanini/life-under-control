/**
 * Dinheiro no LUC é exato e em centavos (invariante #6 do CONTEXT.md): inteiro,
 * BRL, nunca ponto flutuante. Esta é a única forma de virar texto para a UI.
 */

/** Formata centavos (inteiro) como BRL — "R$ 1.234,56" (ponto de milhar, vírgula decimal). */
export function formatBRL(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`valor monetário deve ser inteiro em centavos, recebido: ${cents}`)
  }

  const negativo = cents < 0
  const abs = Math.abs(cents)
  const reais = Math.floor(abs / 100)
  const centavos = abs % 100

  const reaisComMilhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const centavosFmt = String(centavos).padStart(2, "0")

  return `${negativo ? "-" : ""}R$ ${reaisComMilhar},${centavosFmt}`
}
