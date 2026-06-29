import { notFound } from "next/navigation"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { editarConta } from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { Pill } from "@/components/ds/Pill"
import { billParaInicial } from "@/components/financas/bill-form-inicial"
import { ConnectedBillForm } from "@/components/financas/ConnectedBillForm"
import { DangerZone } from "@/components/financas/DangerZone"
import { formatarDataBr } from "@/core/domain/bill"
import { resumoDeExclusao } from "@/core/use-cases/delete-bill"
import { getBill } from "@/core/use-cases/get-bill"
import { getPainel } from "@/core/use-cases/get-painel"

// Lê o banco a cada request: a Conta pode ter mudado; nada de prerender (sem DB no build).
export const dynamic = "force-dynamic"

/** Edição de uma Conta: a mesma forma do cadastro, preenchida, mais a zona de risco. */
export default async function EditarContaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const repo = drizzleBillRepo()

  const bill = await getBill(repo, lar.id, id)
  if (!bill) notFound()

  const dependentes = await resumoDeExclusao(repo, lar.id, id)

  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-7">
        <header className="flex flex-col gap-3">
          <Button href="/areas/financas" variant="ghost" className="self-start">
            ← Finanças
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-extrabold text-3xl text-luc-text tracking-[-0.035em] sm:text-4xl">
              Editar Conta
            </h1>
            {bill.estado === "encerrada" && bill.encerradaEm && (
              <Pill tone="muted">Encerrada em {formatarDataBr(bill.encerradaEm)}</Pill>
            )}
          </div>
          <p className="max-w-prose text-luc-text-2 leading-relaxed">
            Ajustar a regra recalcula o que vem pela frente — nunca reescreve um pagamento já
            registrado.
          </p>
        </header>

        <ConnectedBillForm
          action={editarConta.bind(null, bill.id)}
          inicial={billParaInicial(bill)}
          submitLabel="Salvar alterações"
          submittingLabel="Salvando…"
        />

        <DangerZone
          billId={bill.id}
          estado={bill.estado}
          hoje={systemClock().hoje()}
          dependentes={dependentes}
        />
      </div>
    </div>
  )
}
