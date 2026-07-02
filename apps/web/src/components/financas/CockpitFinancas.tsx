import { MetricCard } from "@/components/ds/MetricCard"
import { TrendCard } from "@/components/ds/TrendCard"
import { formatBRL } from "@/core/domain/money"
import type { AgregadosMes, PontoSerieMensal } from "@/core/use-cases/derive-agregados-financas"

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function monthShort(competencia: string) {
  return MONTHS[Number(competencia.slice(5, 7)) - 1]
}

export function CockpitFinancas({
  agregados,
  serie,
}: {
  agregados: AgregadosMes
  serie: PontoSerieMensal[]
}) {
  const { totalPagoMes, contasEmAberto, gastoMensalMedio, estimativaFaltaPagar } = agregados
  const current = serie.at(-1)?.valor ?? totalPagoMes
  const previous = serie.at(-2)?.valor ?? 0
  const delta = previous > 0 ? ((current - previous) / previous) * 100 : null

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

      <TrendCard
        label="Total pago por mês"
        period={
          serie.length > 0
            ? `${monthShort(serie[0].competencia)} — ${monthShort(serie.at(-1)?.competencia ?? serie[0].competencia)}`
            : "sem histórico"
        }
        value={formatBRL(current)}
        delta={
          delta == null
            ? "sem base anterior"
            : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1).replace(".", ",")}% vs. mês anterior`
        }
        deltaTone={delta == null ? "muted" : delta >= 0 ? "warn" : "success"}
        values={serie.map((point) => point.valor)}
        labels={serie.map((point) => monthShort(point.competencia))}
      />

      <p className="px-1 text-xs leading-snug text-luc-text-3">
        <span className="font-medium text-luc-text-2">Falta pagar</span> é uma <em>estimativa</em>{" "}
        derivada do histórico de cada Conta. O valor exato só nasce no Lançamento.
      </p>
    </div>
  )
}
