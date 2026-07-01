import Link from "next/link"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { PageHeader } from "@/components/ds/PageHeader"
import { formatarDataBr } from "@/core/domain/bill"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"
import { type ItemAgenda, projetarAgenda } from "@/core/use-cases/project-agenda"

export const dynamic = "force-dynamic"

type AgendaGroup = {
  titulo: string
  nota?: string
  tone: "warn" | "default"
  itens: ItemAgenda[]
}

function monthLabel(date: string) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function groupAgenda(items: ItemAgenda[]): AgendaGroup[] {
  const groups: AgendaGroup[] = []
  const open = items.filter((item) => item.estado === "em-aberto")
  if (open.length > 0) {
    groups.push({
      titulo: "Atrasado",
      nota: "venceu ou vence hoje, sem Lançamento",
      tone: "warn",
      itens: open,
    })
  }

  const upcoming = new Map<string, ItemAgenda[]>()
  for (const item of items.filter((entry) => entry.estado === "aguardando")) {
    const key = item.vencimento.slice(0, 7)
    upcoming.set(key, [...(upcoming.get(key) ?? []), item])
  }
  for (const entries of upcoming.values()) {
    groups.push({
      titulo: monthLabel(entries[0].vencimento),
      nota: "projeções das Contas",
      tone: "default",
      itens: entries,
    })
  }
  return groups
}

export default async function AgendaPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const [bills, pagamentos] = await Promise.all([
    listBills(drizzleBillRepo(), lar.id),
    listAllPayments(drizzlePaymentRepo(), lar.id),
  ])
  const groups = groupAgenda(
    projetarAgenda(systemClock(), nationalBankCalendar(), bills, pagamentos),
  )

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto max-w-[820px]">
        <PageHeader
          title="Agenda"
          description="Projeção no tempo do que vence e das Tarefas com data."
          className="mb-[26px]"
        />

        {groups.length === 0 ? (
          <div className="rounded-[14px] border border-luc-border border-dashed bg-luc-surface-2 p-8 text-luc-text-2">
            Nada a vencer por aqui. Tudo em dia.
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.titulo} className="mb-[26px]">
              <div className="mb-[11px] flex items-center gap-2.5">
                <h2
                  className={`text-[13px] font-bold ${group.tone === "warn" ? "text-luc-warn" : "text-luc-text-strong"}`}
                >
                  {group.titulo}
                </h2>
                {group.nota && <span className="text-[11.5px] text-luc-muted">{group.nota}</span>}
              </div>
              <ul className="overflow-hidden rounded-[14px] border border-luc-border bg-luc-surface-2">
                {group.itens.map((item) => (
                  <li
                    key={`${item.geradorId}-${item.competencia}`}
                    className="border-luc-row-line border-t first:border-t-0"
                  >
                    <Link
                      href={`/areas/financas/pagamentos-recorrentes/${item.geradorId}?competencia=${item.competencia}`}
                      className="flex min-h-[70px] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-luc-accent sm:gap-[15px] sm:px-[18px]"
                    >
                      <time className="w-[80px] shrink-0 font-mono text-[12.5px] text-luc-text-2">
                        {formatarDataBr(item.vencimento)}
                      </time>
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${item.estado === "em-aberto" ? "bg-luc-warn" : "bg-luc-accent"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-luc-text">
                          {item.titulo}
                        </span>
                        <span className="block text-[11.5px] text-luc-muted">
                          <span
                            className={`font-semibold ${item.estado === "em-aberto" ? "text-luc-warn" : "text-luc-accent"}`}
                          >
                            {item.estado === "em-aberto" ? "pendente" : "a vencer"}
                          </span>{" "}
                          · Conta · projeção de Finanças
                        </span>
                      </span>
                      <span className="font-mono text-[13.5px] text-luc-disabled">—</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
