import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { AreaCard } from "@/components/ds/AreaCard"
import { MetricCard } from "@/components/ds/MetricCard"
import { PageHeader } from "@/components/ds/PageHeader"
import { PersonChip } from "@/components/ds/PersonChip"
import { TrendCard } from "@/components/ds/TrendCard"
import { AREAS } from "@/core/domain/areas"
import { formatBRL } from "@/core/domain/money"
import {
  derivarAgregadosFinancas,
  serieTotalPago,
} from "@/core/use-cases/derive-agregados-financas"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"

export const dynamic = "force-dynamic"

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]

function mesCurto(competencia: string) {
  return MESES_CURTOS[Number(competencia.slice(5, 7)) - 1]
}

function dataLonga(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`))
}

export default async function PainelPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const [bills, pagamentos] = await Promise.all([
    listBills(drizzleBillRepo(), lar.id),
    listAllPayments(drizzlePaymentRepo(), lar.id),
  ])
  const ativas = bills.filter((bill) => bill.estado === "ativa")
  const agregados = derivarAgregadosFinancas(
    systemClock(),
    nationalBankCalendar(),
    ativas,
    pagamentos,
  )
  const hoje = systemClock().hoje()
  const serie = serieTotalPago(ativas, pagamentos, hoje)
  const ultimo = serie.at(-1)?.valor ?? 0
  const anterior = serie.at(-2)?.valor ?? 0
  const delta = anterior > 0 ? ((ultimo - anterior) / anterior) * 100 : null

  // Contagem das Áreas por estado — derivada do catálogo (o estado vem dos Assuntos, ADR-0009).
  const areasAtivas = AREAS.filter((area) => area.estado === "ativa").length
  const areasEmBreve = AREAS.length - areasAtivas

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3.5">
        <PageHeader
          eyebrow={dataLonga(hoje)}
          title="Painel do Lar"
          description={`${lar.nome} em números — métricas no topo, tendência ao lado.`}
          actions={lar.pessoas.map((pessoa) => (
            <PersonChip key={pessoa.id} pessoa={pessoa} compact />
          ))}
          className="mb-1.5"
        />

        <section aria-label="Leituras do Lar" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Total do mês"
            value={formatBRL(agregados.totalPagoMes)}
            support="Lançamentos"
          />
          <MetricCard
            label="Contas em aberto"
            value={String(agregados.contasEmAberto)}
            support={agregados.contasEmAberto === 1 ? "Conta pede atenção" : "Contas pedem atenção"}
            tone={agregados.contasEmAberto > 0 ? "warn" : "success"}
          />
          <MetricCard
            label="Gasto médio · 12m"
            value={agregados.gastoMensalMedio == null ? "—" : formatBRL(agregados.gastoMensalMedio)}
            support="meses completos"
          />
          <MetricCard
            label="Falta pagar"
            value={
              agregados.estimativaFaltaPagar == null
                ? "—"
                : formatBRL(agregados.estimativaFaltaPagar)
            }
            support="estimativa do histórico"
          />
        </section>

        <TrendCard
          label="Total pago por mês"
          period={`${mesCurto(serie[0].competencia)} — ${mesCurto(serie.at(-1)?.competencia ?? serie[0].competencia)}`}
          value={formatBRL(ultimo)}
          delta={
            delta == null
              ? "sem base anterior"
              : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1).replace(".", ",")}% vs. mês anterior`
          }
          deltaTone={delta == null ? "muted" : delta >= 0 ? "warn" : "success"}
          values={serie.map((ponto) => ponto.valor)}
          labels={serie.map((ponto) => mesCurto(ponto.competencia))}
          className="mb-3"
        />

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[13px] font-bold text-luc-text-strong">Áreas</h2>
            <span className="text-[11.5px] text-luc-muted">
              {areasAtivas} ativa{areasAtivas === 1 ? "" : "s"} · {areasEmBreve} em breve
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {AREAS.map((area) => (
              <AreaCard
                key={area.slug}
                area={area}
                metric={
                  area.slug === "financas"
                    ? `${formatBRL(agregados.totalPagoMes)} · este mês`
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
