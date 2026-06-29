import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Button } from "@/components/ds/Button"
import { BillCard } from "@/components/financas/BillCard"
import { AREAS } from "@/core/domain/areas"
import { getPainel } from "@/core/use-cases/get-painel"
import { listBills } from "@/core/use-cases/list-bills"

// Lê o banco a cada request: nada de prerender estático no build (sem DB lá).
export const dynamic = "force-dynamic"

const financas = AREAS.find((a) => a.slug === "financas")

/** Cockpit de Finanças (tema Pagamentos): lista as Contas do Lar + cadastro. */
export default async function FinancasPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const bills = await listBills(drizzleBillRepo(), lar.id)

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

        <section className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11.5px] text-luc-text-3 uppercase tracking-[0.18em]">
              Contas {bills.length > 0 && <span className="text-luc-faint">· {bills.length}</span>}
            </p>
            <Button href="/areas/financas/nova" variant="primary">
              Nova Conta
            </Button>
          </div>

          {bills.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-1 p-8">
              <p className="text-luc-text-2 leading-relaxed">
                Nenhuma Conta ainda. Cadastre a primeira regra de pagamento recorrente — a Conta
                guarda o <em>quando</em>, nunca o <em>quanto</em>.
              </p>
              <Button href="/areas/financas/nova" variant="ghost">
                Cadastrar Conta
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {bills.map((bill) => (
                <BillCard key={bill.id} bill={bill} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
