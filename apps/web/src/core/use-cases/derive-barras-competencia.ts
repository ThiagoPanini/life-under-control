import type { Bill } from "@/core/domain/bill"
import { pontosDe, type SerieTotalPago } from "./derive-agregados-financas"
import { mesDe, ocorrenciasRecentes } from "./derive-bill-card"

/**
 * Estado de uma barra (issue #55). `lacuna` é a ausência honesta: nenhuma Conta
 * ativa esperava ocorrência naquela competência (ex.: Conta trimestral fora do
 * mês da âncora) — distinto de `fechado` com `valor: 0`, que é o fato real de
 * "esperava e não pagou". CONTEXT.md invariante #3: interpretação derivada, não
 * um zero disfarçando a ausência de expectativa.
 */
export type EstadoBarraCompetencia = "fechado" | "em-curso" | "lacuna"

export type PontoBarraCompetencia = {
  competencia: string
  valor: number
  estado: EstadoBarraCompetencia
}

/**
 * A série do total pago (#48), reclassificada por barra: mês corrente sempre
 * `em-curso`; mês fechado sem nenhuma Conta ativa esperando ocorrência vira
 * `lacuna`; o resto é `fechado` (mesmo quando `valor` é zero por falta de
 * pagamento — fato real, não lacuna).
 */
export function pontosBarraCompetencia(
  serie: SerieTotalPago,
  bills: Bill[],
  hoje: string,
): PontoBarraCompetencia[] {
  const pontos = pontosDe(serie)
  if (pontos.length === 0) return []

  const esperadas = competenciasEsperadas(bills, mesDe(hoje), pontos.length)
  return pontos.map((ponto) => ({
    competencia: ponto.competencia,
    valor: ponto.valor,
    estado: ponto.emCurso
      ? "em-curso"
      : ponto.valor === 0 && !esperadas.has(ponto.competencia)
        ? "lacuna"
        : "fechado",
  }))
}

/**
 * Valores prontos pro sparkline (issue #55/#56): só competências `fechado` —
 * nunca `em-curso` (mês parcial mentiria na linha) nem `lacuna` (não é um
 * valor pago, é ausência de expectativa).
 */
export function valoresFechados(pontos: PontoBarraCompetencia[]): number[] {
  return pontos.filter((ponto) => ponto.estado === "fechado").map((ponto) => ponto.valor)
}

/**
 * Uma Conta encerrada ainda esperava ocorrência **antes** de fechar — não
 * incluí-la apagaria um "esperava e não pagou" real (ex.: mês perdido antes de
 * cancelar a assinatura), disfarçando-o de lacuna. Mas ela não pode esperar
 * nada **depois** do próprio fechamento — daí o teto no mês de `encerradaEm`.
 */
function competenciasEsperadas(bills: Bill[], mesCorrente: string, tamanho: number): Set<string> {
  const esperadas = new Set<string>()
  for (const bill of bills) {
    const refCompetencia =
      bill.estado === "encerrada" && bill.encerradaEm
        ? menorCompetencia(mesDe(bill.encerradaEm), mesCorrente)
        : mesCorrente
    for (const competencia of ocorrenciasRecentes(bill.recurrence, refCompetencia, tamanho)) {
      esperadas.add(competencia)
    }
  }
  return esperadas
}

function menorCompetencia(a: string, b: string): string {
  return a < b ? a : b
}
