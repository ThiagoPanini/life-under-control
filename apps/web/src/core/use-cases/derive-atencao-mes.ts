import type { EstimativaMes, MarcadorPista } from "./derive-forma-competencia"

/**
 * Soma dos vencimentos que **pedem atenção agora** (issue #58, herói do
 * cockpit): os marcadores em `a-vencer` da forma-da-Competência (#61) —
 * vencidos, hoje ou ≤3 dias, o mesmo limiar do farol. Compõe sobre o shape já
 * derivado, nunca recalcula estado a partir de Contas/Lançamentos. Marcador
 * sem histórico (`valorEsperado: null`) não entra — nunca inventa valor;
 * nenhum `a-vencer` com valor conhecido devolve o shape explícito.
 */
export function somarPedemAtencaoAgora(marcadores: MarcadorPista[]): EstimativaMes {
  let total: number | null = null
  for (const marcador of marcadores) {
    if (marcador.estado !== "a-vencer" || marcador.valorEsperado == null) continue
    total = (total ?? 0) + marcador.valorEsperado
  }
  return total == null ? { estado: "sem-historico" } : { estado: "estimado", valor: total }
}
