import type { ContaMatcher } from "@/core/ports/conta-matcher"

/**
 * Fake do matcher de Conta: devolve uma ordenação scriptada de billIds. Favorecido
 * nulo abstém (vazio) — sem favorecido não há o que casar, espelhando o adapter
 * real. Os ids são filtrados às candidatas oferecidas: o núcleo não confia num id
 * fora do conjunto (mesma guarda do adapter real).
 */
export function fakeContaMatcher(ordenacao: string[] = []): ContaMatcher {
  return async (favorecido, candidatas) => {
    if (favorecido == null) return []
    const oferecidas = new Set(candidatas.map((c) => c.billId))
    // Mesma guarda do adapter real: só ids do conjunto oferecido, sem repetição.
    const ordenados: string[] = []
    for (const id of ordenacao) {
      if (oferecidas.has(id) && !ordenados.includes(id)) ordenados.push(id)
    }
    return ordenados
  }
}
