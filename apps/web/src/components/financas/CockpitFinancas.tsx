import { MetricCard } from "@/components/ds/MetricCard"
import { BarrasCompetencia } from "@/components/financas/BarrasCompetencia"
import type { Bill } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import {
  type AgregadosMes,
  compararMesFechado,
  type SerieTotalPago,
} from "@/core/use-cases/derive-agregados-financas"
import { pontosBarraCompetencia } from "@/core/use-cases/derive-barras-competencia"
import { textoComparativo, tonalidadeComparativo } from "./comparativo-mensal"

export function CockpitFinancas({
  agregados,
  serie,
  bills,
  hoje,
}: {
  agregados: AgregadosMes
  serie: SerieTotalPago
  bills: Bill[]
  hoje: string
}) {
  const { totalPagoMes, contasEmAberto, gastoMensalMedio, estimativaFaltaPagar } = agregados
  const pontos = pontosBarraCompetencia(serie, bills, hoje)
  const comparativo = compararMesFechado(serie)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Pago no mês"
          value={formatBRL(totalPagoMes)}
          support="soma dos Lançamentos"
        />
        <MetricCard
          label="Em aberto"
          value={String(contasEmAberto)}
          support={contasEmAberto === 1 ? "Conta" : "Contas"}
          tone={contasEmAberto > 0 ? "warn" : "success"}
        />
        <MetricCard
          label="Gasto médio · 12m"
          value={gastoMensalMedio == null ? "—" : formatBRL(gastoMensalMedio)}
          support="meses completos"
        />
        <MetricCard
          label="Falta pagar"
          value={estimativaFaltaPagar == null ? "—" : formatBRL(estimativaFaltaPagar)}
          support="estimativa"
        />
      </div>

      <BarrasCompetencia
        titulo="Total pago por competência"
        pontos={pontos}
        mediaMensal={gastoMensalMedio}
        deltaTexto={textoComparativo(comparativo)}
        deltaTone={tonalidadeComparativo(comparativo)}
      />

      <p className="px-1 text-xs leading-snug text-luc-text-3">
        <span className="font-medium text-luc-text-2">Falta pagar</span> é uma <em>estimativa</em>{" "}
        derivada do histórico de cada Conta. O valor exato só nasce no Lançamento.
      </p>
    </div>
  )
}
