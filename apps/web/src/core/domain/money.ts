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

/**
 * Lê um valor BRL digitado (a borda da baixa) em centavos inteiros — `null` se
 * não for dinheiro válido e positivo. Aceita o formato brasileiro com milhar
 * ("1.234,56" · "1.500"), a vírgula decimal sem milhar ("19,99") e o ponto
 * decimal do teclado numérico ("1234.56" · "129.90"), além do inteiro de reais
 * ("1500" → R$ 1.500,00). Recusa mais de 2 casas decimais, sinal negativo (uma
 * baixa é positiva) e caractere fora do esperado. Sem ponto flutuante: monta os
 * centavos a partir das partes inteiras (#6).
 */
export function parseCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$/i, "").replace(/\s/g, "")
  if (limpo === "" || !/^[\d.,]+$/.test(limpo)) return null

  const normal = limpo.includes(",")
    ? // Vírgula é o decimal; pontos são de milhar.
      limpo.replace(/\./g, "").replace(",", ".")
    : normalizarSoComPontos(limpo)
  if (normal === null || !/^\d+(\.\d{1,2})?$/.test(normal)) return null

  const [reais, frac = ""] = normal.split(".")
  const centavos = Number(reais) * 100 + Number(frac.padEnd(2, "0"))
  if (!Number.isSafeInteger(centavos) || centavos <= 0) return null
  return centavos
}

/**
 * Resolve a ambiguidade do ponto sem vírgula: dinheiro tem 2 casas, então um
 * último grupo de 3 dígitos é milhar ("1.500" → "1500"); de 1–2 dígitos é
 * decimal ("129.90" → "129.90", com pontos anteriores como milhar). `null` se a
 * forma não couber em nenhum dos dois (ex.: 4+ dígitos após o ponto).
 */
function normalizarSoComPontos(limpo: string): string | null {
  if (!limpo.includes(".")) return limpo
  const partes = limpo.split(".")
  const ultima = partes[partes.length - 1]
  if (ultima.length === 3) return partes.join("")
  if (ultima.length === 1 || ultima.length === 2) {
    const dec = partes.pop() as string
    return `${partes.join("")}.${dec}`
  }
  return null
}

/**
 * Projeta centavos no texto que o campo de valor edita ("1234,56" — vírgula
 * decimal, sem milhar), para pré-preencher a baixa e a edição. Round-trip com
 * `parseCentavos`. Distinto de `formatBRL`, que é para *exibir* ("R$ 1.234,56").
 */
export function centavosParaCampo(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`valor monetário deve ser inteiro em centavos, recebido: ${cents}`)
  }
  const reais = Math.trunc(cents / 100)
  const centavos = Math.abs(cents % 100)
  return `${reais},${String(centavos).padStart(2, "0")}`
}
