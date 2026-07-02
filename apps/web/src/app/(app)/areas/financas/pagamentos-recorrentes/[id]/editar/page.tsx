import { notFound } from "next/navigation"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { editarConta } from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { PageHeader } from "@/components/ds/PageHeader"
import { Pill } from "@/components/ds/Pill"
import { Surface } from "@/components/ds/Surface"
import { BillLogoPicker } from "@/components/financas/BillLogoPicker"
import { billParaInicial } from "@/components/financas/bill-form-inicial"
import { ConnectedBillForm } from "@/components/financas/ConnectedBillForm"
import { DangerZone } from "@/components/financas/DangerZone"
import { formatarDataBr } from "@/core/domain/bill"
import { resumoDeExclusao } from "@/core/use-cases/delete-bill"
import { getBill } from "@/core/use-cases/get-bill"
import { getLogoUrl } from "@/core/use-cases/get-logo-url"
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
  const logoUrl = await getLogoUrl(r2AttachmentStore(), bill.logoKey)

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <Button
          href={`/areas/financas/pagamentos-recorrentes/${bill.id}`}
          variant="ghost"
          className="self-start"
        >
          ← {bill.nome}
        </Button>
        <PageHeader
          title="Editar Conta"
          description="Ajustar a regra recalcula o futuro — nunca reescreve um Lançamento passado."
          actions={
            bill.estado === "encerrada" && bill.encerradaEm ? (
              <Pill tone="muted">encerrada em {formatarDataBr(bill.encerradaEm)}</Pill>
            ) : undefined
          }
        />

        <Surface className="p-5 sm:p-6">
          <ConnectedBillForm
            action={editarConta.bind(null, bill.id)}
            inicial={billParaInicial(bill)}
            submitLabel="Salvar alterações"
            submittingLabel="Salvando…"
          />
          <BillLogoPicker billId={bill.id} icon={bill.icon} logoUrl={logoUrl} />
        </Surface>

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
