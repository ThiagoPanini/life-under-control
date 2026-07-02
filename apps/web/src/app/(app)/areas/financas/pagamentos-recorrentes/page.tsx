import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { Button } from "@/components/ds/Button"
import { PageHeader } from "@/components/ds/PageHeader"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { BillCard } from "@/components/financas/BillCard"
import { CockpitFinancas } from "@/components/financas/CockpitFinancas"
import { EncerradasSection } from "@/components/financas/EncerradasSection"
import { gastoMensalMedio } from "@/core/use-cases/derive-agregados-financas"
import { derivarCardConta, mesDe } from "@/core/use-cases/derive-bill-card"
import { derivarFormaCompetencia } from "@/core/use-cases/derive-forma-competencia"
import { calcularPontualidade12m } from "@/core/use-cases/derive-pontualidade"
import { getLogoUrl } from "@/core/use-cases/get-logo-url"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"

// Lê o banco a cada request: nada de prerender estático no build (sem DB lá).
export const dynamic = "force-dynamic"

const EYEBROW = (
  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-luc-faint">
    Finanças · Assunto
  </span>
)

/** Cockpit do Assunto Pagamentos Recorrentes: agregados do mês no topo (#22) + lista de Contas e cadastro. */
export default async function FinancasPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const bills = await listBills(drizzleBillRepo(), lar.id)
  const ativas = bills.filter((b) => b.estado === "ativa")
  const encerradas = bills.filter((b) => b.estado === "encerrada")

  // A lente de competência (cockpit, #58): soma o Lar inteiro — uma só leitura
  // de todos os Lançamentos das Contas ativas (sem N+1 por Conta).
  const pagamentos = await listAllPayments(drizzlePaymentRepo(), lar.id)
  const hoje = systemClock().hoje()
  const competencia = mesDe(hoje)
  const forma = derivarFormaCompetencia(
    systemClock(),
    nationalBankCalendar(),
    ativas,
    pagamentos,
    competencia,
  )
  const pontualidade = calcularPontualidade12m(ativas, pagamentos, hoje, nationalBankCalendar())
  const gastoMedio = gastoMensalMedio(ativas, pagamentos, hoje)

  // Logo das Contas que têm (#50): a URL assinada é presign local (sem rede),
  // então resolver todas de uma vez é barato — sem N+1 real.
  const store = r2AttachmentStore()
  const logoUrls = new Map(
    await Promise.all(
      bills
        .filter((bill) => bill.logoKey)
        .map(async (bill) => [bill.id, await getLogoUrl(store, bill.logoKey)] as const),
    ),
  )

  const cards = new Map(
    ativas.map((bill) => [
      bill.id,
      derivarCardConta(
        systemClock(),
        nationalBankCalendar(),
        bill,
        pagamentos.filter((payment) => payment.billId === bill.id),
      ),
    ]),
  )

  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
        <PageHeader
          eyebrow={EYEBROW}
          title="Pagamentos Recorrentes"
          actions={
            <Button href="/areas/financas/pagamentos-recorrentes/nova" variant="primary">
              Nova Conta
            </Button>
          }
        />

        {ativas.length > 0 && (
          <section aria-labelledby="panorama-heading" className="flex flex-col gap-3.5">
            <SectionHeading
              id="panorama-heading"
              title="Panorama"
              subtitle="Métricas do mês e a tendência dos pagamentos"
            />
            <CockpitFinancas
              competencia={competencia}
              hoje={hoje}
              forma={forma}
              gastoMensalMedio={gastoMedio}
              pontualidade={pontualidade}
            />
          </section>
        )}

        <section aria-labelledby="contas-ativas-heading" className="flex flex-col gap-5">
          <SectionHeading
            id="contas-ativas-heading"
            title="Contas ativas"
            suffix={ativas.length > 0 ? `· ${ativas.length}` : undefined}
            subtitle="Estado de cada Conta neste mês · o valor real nasce na quitação"
          />

          {ativas.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-1 p-8">
              <p className="text-luc-text-2 leading-relaxed">
                Nenhuma Conta ativa. Cadastre a primeira regra de pagamento recorrente — a Conta
                guarda o <em>quando</em>, nunca o <em>quanto</em>.
              </p>
              <Button href="/areas/financas/pagamentos-recorrentes/nova" variant="secondary">
                Cadastrar Conta
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {ativas.map((bill) => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  card={cards.get(bill.id)}
                  logoUrl={logoUrls.get(bill.id)}
                />
              ))}
            </div>
          )}
        </section>

        <EncerradasSection bills={encerradas} logoUrls={logoUrls} />
      </div>
    </div>
  )
}
