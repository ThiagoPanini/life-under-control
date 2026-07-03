import Link from "next/link"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { PageHeader } from "@/components/ds/PageHeader"
import { PersonChip } from "@/components/ds/PersonChip"
import { AtencaoTira } from "@/components/painel/AtencaoTira"
import { HeroAreaAtivaCard } from "@/components/painel/HeroAreaAtivaCard"
import { AREAS } from "@/core/domain/areas"
import { assuntosDaArea } from "@/core/domain/subjects"
import { derivarAtencaoDoPainel } from "@/core/use-cases/derive-atencao"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"
import { resolveAvatares } from "@/core/use-cases/resolve-avatares"

export const dynamic = "force-dynamic"

function dataLonga(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`))
}

export default async function PainelPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const [bills, pagamentos, pessoas] = await Promise.all([
    listBills(drizzleBillRepo(), lar.id),
    listAllPayments(drizzlePaymentRepo(), lar.id),
    resolveAvatares(lar.pessoas, r2AttachmentStore()),
  ])

  const hoje = systemClock().hoje()
  const atencao = derivarAtencaoDoPainel(systemClock(), nationalBankCalendar(), bills, pagamentos)

  const areaFinancas = AREAS.find((area) => area.slug === "financas")
  const areasEmBreve = AREAS.filter((area) => area.estado === "em-breve")
  const assuntosFinancas = assuntosDaArea("financas")
  const assuntoAtivo = assuntosFinancas.find((assunto) => assunto.estado === "ativa")
  const assuntosEmBreve = assuntosFinancas.filter((assunto) => assunto.estado === "em-breve")
  const contasAtivas = bills.filter((bill) => bill.estado === "ativa").length

  const hrefConta = (contaId: string) => `/areas/financas/pagamentos-recorrentes/${contaId}`
  const paymentHref = (contaId: string, competencia: string) =>
    `/areas/financas/pagamentos-recorrentes/${contaId}?registrar=1&competencia=${competencia}`

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3.5">
        <PageHeader
          eyebrow={dataLonga(hoje)}
          title="Painel do Lar"
          description="O que pede ação e o estado das Áreas — o retrospecto vive em cada Assunto."
          actions={[
            <span key="lar" className="text-[13px] font-semibold text-luc-text-2">
              {lar.nome}
            </span>,
            ...pessoas.map((pessoa) => <PersonChip key={pessoa.id} pessoa={pessoa} compact />),
          ]}
          className="mb-1.5"
        />

        <AtencaoTira tira={atencao.tira} hrefConta={hrefConta} paymentHref={paymentHref} />

        {areaFinancas && assuntoAtivo && (
          <HeroAreaAtivaCard
            area={areaFinancas}
            assuntoNome={assuntoAtivo.nome}
            contasAtivas={contasAtivas}
            emBreveResumo={
              assuntosEmBreve.length > 0
                ? `${assuntosEmBreve.map((assunto) => assunto.nome).join(", ")} em breve`
                : "Mais Assuntos em breve"
            }
            hero={atencao.hero}
            href={`/areas/${areaFinancas.slug}`}
          />
        )}

        {areasEmBreve.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {areasEmBreve.map((area) => (
              <Link
                key={area.slug}
                href={`/areas/${area.slug}`}
                className="flex items-center gap-2 rounded-full border border-luc-border bg-luc-surface-2 px-3 py-1.5 text-xs text-luc-text-2 transition-colors hover:border-luc-border-strong hover:text-luc-text"
              >
                <span className="text-luc-text-3">
                  <AreaIcon name={area.icon} size={14} />
                </span>
                {area.nome}
                <span className="text-luc-faint">· em breve</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
