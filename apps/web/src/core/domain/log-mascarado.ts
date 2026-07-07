/**
 * Mascaramento pra log auditável do webhook (issue #155 — "logs sem token e
 * sem número completo"). Token/secret nunca são logados, nem mascarados —
 * função aqui é só pro telefone do remetente.
 */

/**
 * Mascara um telefone E.164 preservando o sinal `+` e os últimos 2 dígitos;
 * o resto vira `*`. Números curtos demais pra sobrar algo além do sufixo são
 * mascarados por inteiro, pra nunca revelar o número completo por acidente.
 */
export function mascararTelefone(telefone: string): string {
  const temSinal = telefone.startsWith("+")
  const resto = temSinal ? telefone.slice(1) : telefone

  const mascarado =
    resto.length <= 4
      ? "*".repeat(resto.length)
      : `${resto.slice(0, 2)}${"*".repeat(resto.length - 4)}${resto.slice(-2)}`

  return temSinal ? `+${mascarado}` : mascarado
}
