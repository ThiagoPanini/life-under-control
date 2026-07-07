import { ehDataIsoValida } from "./bill"

/**
 * Lê a data de pagamento que o casal digita no chat (#178) em pt-BR — `dd/mm` ou
 * `dd/mm/aaaa` (ano de 2 ou 4 dígitos) — e devolve ISO (`YYYY-MM-DD`), ou `null`
 * se não for uma data **real** (rejeita 31 de mês curto, 29/02 não-bissexto, lixo).
 *
 * Valor editado é fato humano, mas validado (#178): o parser é a validação. Sem
 * ano, infere o de `hojeIso` — e recua um ano se a data cairia no futuro, porque
 * um comprovante é sempre de pagamento **já feito** (a virada de ano, ex.: hoje
 * 08/01 e recibo "31/12"). Puro: `hojeIso` é injetado, sem relógio.
 */
export function parseDataBrParaIso(texto: string, hojeIso: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
  if (!m) return null

  const dia = m[1].padStart(2, "0")
  const mes = m[2].padStart(2, "0")

  let ano: string
  if (m[3] != null) {
    ano = m[3].length === 2 ? `20${m[3]}` : m[3]
  } else {
    const anoHoje = Number(hojeIso.slice(0, 4))
    const candidato = `${anoHoje}-${mes}-${dia}`
    // Sem ano e no futuro → é do ano passado (pagamento nunca é data futura).
    ano = String(candidato > hojeIso ? anoHoje - 1 : anoHoje)
  }

  const iso = `${ano}-${mes}-${dia}`
  return ehDataIsoValida(iso) ? iso : null
}
