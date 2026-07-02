import { MetricCard } from "@/components/ds/MetricCard"
import { TrendCard } from "@/components/ds/TrendCard"
import { formatBRL } from "@/core/domain/money"
import {
  type AgregadosMes,
  compararMesFechado,
  pontosDe,
  type SerieTotalPago,
} from "@/core/use-cases/derive-agregados-financas"
import { textoComparativo, tonalidadeComparativo } from "./comparativo-mensal"

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function monthShort(competencia: string) {
  return MONTHS[Number(competencia.slice(5, 7)) - 1]
}

export function CockpitFinancas({
  agregados,
  serie,
}: {
  agregados: AgregadosMes
  serie: SerieTotalPago
}) {
  const { totalPagoMes, contasEmAberto, gastoMensalMedio, estimativaFaltaPagar } = agregados
  const pontos = pontosDe(serie)
  const current = pontos.at(-1)?.valor ?? totalPagoMes
  const comparativo = compararMesFechado(serie)

  return (
    <section aria-labelledby="finance-readings" className="flex flex-col gap-3.5">
      <h2 id="finance-readings" className="sr-only">
        Leituras de Finanças
      </h2>
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
          pontos.length > 0
            ? `${monthShort(pontos[0].competencia)} — ${monthShort(pontos.at(-1)?.competencia ?? pontos[0].competencia)}`
            : "sem histórico"
        }
        value={formatBRL(current)}
        delta={textoComparativo(comparativo)}
        deltaTone={tonalidadeComparativo(comparativo)}
        values={pontos.map((ponto) => ponto.valor)}
        labels={pontos.map((ponto) => monthShort(ponto.competencia))}
      />

      <p className="px-1 text-xs leading-snug text-luc-text-3">
        <span className="font-medium text-luc-text-2">Falta pagar</span> é uma <em>estimativa</em>{" "}
        derivada do histórico de cada Conta. O valor exato só nasce no Lançamento.
      </p>
    </section>
  )
}
