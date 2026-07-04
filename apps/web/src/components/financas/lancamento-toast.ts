import { formatBRL } from "@/core/domain/money"

/** Frase da quantidade de comprovantes associados — plural, singular ou ausência. */
function textoComprovantes(quantidade: number): string {
  if (quantidade <= 0) return "sem comprovantes"
  return `${quantidade} ${quantidade === 1 ? "comprovante" : "comprovantes"}`
}

/**
 * Mensagem do toast final da baixa pelo modal compacto (#100): identifica a Conta,
 * o **valor** de fato registrado (o exato do Lançamento, não a estimativa) e a
 * **quantidade de comprovantes efetivamente associados** — o número que sobreviveu
 * a falhas parciais, não o de arquivos tentados. Módulo puro (sem `"use client"`)
 * para o Server Component montar a mensagem e passar a string pronta ao toast
 * cliente — a mesma disciplina de `payment-form-inicial`.
 */
export function mensagemLancamentoRegistrado(
  nome: string,
  valor: number,
  comprovantes: number,
): string {
  return `Lançamento registrado — ${nome} · ${formatBRL(valor)} · ${textoComprovantes(comprovantes)}`
}
