import type { Comparativo } from "@/core/use-cases/derive-agregados-financas"

/** O texto do comparativo (issue #48) — mesmo em CockpitFinancas e no Painel. */
export function textoComparativo(comparativo: Comparativo): string {
  if (comparativo.estado === "em-curso") return "em curso"
  if (comparativo.estado === "sem-base-anterior") return "sem base anterior"
  const { deltaPercentual } = comparativo
  return `${deltaPercentual >= 0 ? "+" : "−"}${Math.abs(deltaPercentual).toFixed(1).replace(".", ",")}% vs. mês anterior`
}

export function tonalidadeComparativo(comparativo: Comparativo): "success" | "warn" | "muted" {
  if (comparativo.estado !== "fechado") return "muted"
  return comparativo.deltaPercentual >= 0 ? "warn" : "success"
}
