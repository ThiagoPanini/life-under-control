import Link from "next/link"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { Pill } from "@/components/ds/Pill"
import { formatarDataBr } from "@/core/domain/bill"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"
import { projetarAgenda } from "@/core/use-cases/project-agenda"

// Vista pura (invariante #7): lê o banco a cada request — a projeção muda com o
// tempo e a cada baixa. Nada de prerender estático (sem DB no build).
export const dynamic = "force-dynamic"

/**
 * Agenda (issue #23): a projeção das Contas ativas a vencer — vista pura, sem dado
 * próprio. Lista as ocorrências não-pagas do mês vigente + próximo, ordenadas no
 * tempo e **sem valor** (invariantes #5/#7). Cada item leva à baixa da (Conta,
 * competência). Hoje só Finanças alimenta; a estrutura é agnóstica de Área.
 */
export default async function AgendaPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const [bills, pagamentos] = await Promise.all([
    listBills(drizzleBillRepo(), lar.id),
    listAllPayments(drizzlePaymentRepo(), lar.id),
  ])
  const itens = projetarAgenda(systemClock(), nationalBankCalendar(), bills, pagamentos)

  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-[11.5px] text-luc-accent uppercase tracking-[0.18em]">
            Agenda
          </p>
          <h1 className="font-extrabold text-3xl text-luc-text tracking-[-0.035em] sm:text-4xl">
            Agenda
          </h1>
          <p className="text-luc-text-2">
            O que vence no mês e no próximo — só o quando, sem valor.
          </p>
        </header>

        {itens.length === 0 ? (
          <div className="rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-1 p-8">
            <p className="text-luc-text-2 leading-relaxed">Nada a vencer por aqui. Tudo em dia.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {itens.map((item) => (
              <li key={`${item.geradorId}-${item.competencia}`}>
                <Link
                  href={`/areas/financas/${item.geradorId}?competencia=${item.competencia}`}
                  className="flex items-center justify-between gap-4 rounded-luc-lg border border-luc-border bg-luc-surface-1 px-5 py-4 transition-colors hover:bg-luc-surface-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold text-luc-text">{item.titulo}</span>
                    <span className="font-mono text-[11.5px] text-luc-text-3">
                      Vence {formatarDataBr(item.vencimento)}
                    </span>
                  </div>
                  <Pill tone={item.estado === "em-aberto" ? "accent" : "muted"}>
                    {item.estado === "em-aberto" ? "Vencida" : "A vencer"}
                  </Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
