import Link from "next/link"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Button } from "@/components/ds/Button"
import { BillCard } from "@/components/financas/BillCard"
import { CockpitFinancas } from "@/components/financas/CockpitFinancas"
import { AREAS } from "@/core/domain/areas"
import { derivarAgregadosFinancas } from "@/core/use-cases/derive-agregados-financas"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"

// Lê o banco a cada request: nada de prerender estático no build (sem DB lá).
export const dynamic = "force-dynamic"

const financas = AREAS.find((a) => a.slug === "financas")

/** Cockpit de Finanças (tema Pagamentos): agregados do mês no topo (#22) + lista de Contas e cadastro. */
export default async function FinancasPage({
  searchParams,
}: {
  searchParams: Promise<{ encerradas?: string }>
}) {
  const { encerradas: param } = await searchParams
  const mostrarEncerradas = param === "1"

  const { lar } = await getPainel(drizzleHouseholdRepo())
  const bills = await listBills(drizzleBillRepo(), lar.id)
  const ativas = bills.filter((b) => b.estado === "ativa")
  const encerradas = bills.filter((b) => b.estado === "encerrada")

  // Agregados do mês (cockpit, #22): somam o Lar inteiro — uma só leitura de
  // todos os Lançamentos das Contas ativas (sem N+1 por Conta).
  const pagamentos = await listAllPayments(drizzlePaymentRepo(), lar.id)
  const agregados = derivarAgregadosFinancas(
    systemClock(),
    nationalBankCalendar(),
    ativas,
    pagamentos,
  )

  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-luc-lg border border-luc-border bg-luc-surface-2 text-luc-text-2">
            <AreaIcon name={financas?.icon ?? "wallet"} size={28} />
          </span>
          <p className="font-mono text-[11.5px] text-luc-accent uppercase tracking-[0.18em]">
            Pagamentos
          </p>
          <h1 className="font-extrabold text-3xl text-luc-text tracking-[-0.035em] sm:text-4xl">
            {financas?.nome ?? "Finanças"}
          </h1>
        </header>

        {ativas.length > 0 && <CockpitFinancas agregados={agregados} />}

        <section className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11.5px] text-luc-text-3 uppercase tracking-[0.18em]">
              Contas{" "}
              {ativas.length > 0 && <span className="text-luc-faint">· {ativas.length}</span>}
            </p>
            <Button href="/areas/financas/nova" variant="primary">
              Nova Conta
            </Button>
          </div>

          {ativas.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-1 p-8">
              <p className="text-luc-text-2 leading-relaxed">
                Nenhuma Conta ativa. Cadastre a primeira regra de pagamento recorrente — a Conta
                guarda o <em>quando</em>, nunca o <em>quanto</em>.
              </p>
              <Button href="/areas/financas/nova" variant="ghost">
                Cadastrar Conta
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ativas.map((bill) => (
                <BillCard key={bill.id} bill={bill} />
              ))}
            </div>
          )}
        </section>

        {encerradas.length > 0 && (
          <section className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[11.5px] text-luc-text-3 uppercase tracking-[0.18em]">
                Encerradas <span className="text-luc-faint">· {encerradas.length}</span>
              </p>
              <Link
                href={mostrarEncerradas ? "/areas/financas" : "/areas/financas?encerradas=1"}
                className="font-mono text-[11.5px] text-luc-accent uppercase tracking-[0.14em] hover:underline"
              >
                {mostrarEncerradas ? "Ocultar" : "Mostrar encerradas"}
              </Link>
            </div>

            {mostrarEncerradas && (
              <div className="flex flex-col gap-3">
                {encerradas.map((bill) => (
                  <BillCard key={bill.id} bill={bill} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
