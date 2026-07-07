import { ehDataIsoValida } from "./bill"

/**
 * Quantos anos recuar procurando a ocorrência passada de um `dd/mm` sem ano. O teto
 * cobre o pior caso do calendário: o intervalo entre dois 29/02 chega a 8 anos na
 * virada de século não-bissexta (ex.: 2096 → 2104).
 */
const MAX_RECUO_ANOS = 8

/**
 * Lê a data de pagamento que o casal digita no chat (#178) em pt-BR — `dd/mm` ou
 * `dd/mm/aaaa` (ano de 2 ou 4 dígitos) — e devolve ISO (`YYYY-MM-DD`), ou `null`
 * se não for uma data **real** (rejeita 31 de mês curto, 29/02 não-bissexto, lixo).
 *
 * Valor editado é fato humano, mas validado (#178): o parser é a validação. Sem ano,
 * pega a **ocorrência passada mais recente** — um comprovante é sempre pagamento **já
 * feito** (nunca data futura). Recua ano a ano do de `hojeIso` até casar uma data real
 * que não seja futura: resolve a virada de ano (hoje 08/01, recibo "31/12" → ano
 * passado) e o 29/02 sem ano (recua até o bissexto anterior). Puro: `hojeIso` é
 * injetado, sem relógio.
 */
export function parseDataBrParaIso(texto: string, hojeIso: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
  if (!m) return null

  const dia = m[1].padStart(2, "0")
  const mes = m[2].padStart(2, "0")

  if (m[3] != null) {
    // Ano explícito: intenção do casal — valida a realidade, sem forçar passado.
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    const iso = `${ano}-${mes}-${dia}`
    return ehDataIsoValida(iso) ? iso : null
  }

  // Sem ano: desce do ano de hoje até a 1ª ocorrência real e não-futura.
  const anoHoje = Number(hojeIso.slice(0, 4))
  for (let ano = anoHoje; ano > anoHoje - MAX_RECUO_ANOS; ano -= 1) {
    const iso = `${ano}-${mes}-${dia}`
    if (ehDataIsoValida(iso) && iso <= hojeIso) return iso
  }
  return null
}
