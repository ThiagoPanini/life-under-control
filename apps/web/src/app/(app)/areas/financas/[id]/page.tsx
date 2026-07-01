import { notFound } from "next/navigation"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleAttachmentRepo } from "@/adapters/db/attachment-repo.drizzle"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { criarLancamento } from "@/app/(app)/areas/financas/actions"
import { auth } from "@/auth"
import { Button } from "@/components/ds/Button"
import { Pill } from "@/components/ds/Pill"
import { Surface } from "@/components/ds/Surface"
import { BillIcon } from "@/components/financas/BillIcon"
import { ConnectedPaymentForm } from "@/components/financas/ConnectedPaymentForm"
import { LancamentosLista } from "@/components/financas/LancamentosLista"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { Attachment } from "@/core/domain/attachment"
import { descreverRecorrencia, descreverVencimento, formatarDataBr } from "@/core/domain/bill"
import { centavosParaCampo } from "@/core/domain/money"
import { ehCompetenciaValida } from "@/core/domain/payment"
import { getBill } from "@/core/use-cases/get-bill"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAttachmentsDeLancamentos } from "@/core/use-cases/list-attachments"
import { listPayments } from "@/core/use-cases/list-payments"

// Lê o banco a cada request: os Lançamentos mudam; nada de prerender (sem DB no build).
export const dynamic = "force-dynamic"

/**
 * Detalhe da Conta: a regra no topo, a baixa de um Lançamento e a lista dos
 * Lançamentos (com editar/deletar). O card derivado mora na visão de Finanças;
 * aqui a regra e os fatos ganham espaço operacional.
 */
export default async function ContaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ competencia?: string }>
}) {
  const { id } = await params
  const { competencia: compParam } = await searchParams

  // Dado o Lar, a Conta, seus Lançamentos e a sessão são independentes — em paralelo.
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const [bill, lancamentos, session] = await Promise.all([
    getBill(drizzleBillRepo(), lar.id, id),
    listPayments(drizzlePaymentRepo(), lar.id, id),
    auth(),
  ])
  if (!bill) notFound()

  // Defaults da baixa: hoje (via Clock), a competência pedida (Agenda, #23) ou o
  // mês corrente, o valor do último Lançamento e a Pessoa logada como autor.
  const hoje = systemClock().hoje()
  const competencia = ehCompetenciaValida(compParam ?? "")
    ? (compParam as string)
    : hoje.slice(0, 7)
  const ultimo = lancamentos[0]
  // "Quem pagou" default = a Pessoa logada, casada por e-mail (case-insensitive,
  // resiliente à normalização do OAuth). Sem casar (atribuição completa depende
  // do auth, #7), cai na 1ª Pessoa — e o campo é editável antes de gravar.
  const emailLogado = session?.user?.email?.toLowerCase()
  const pessoaLogada =
    (emailLogado && lar.pessoas.find((p) => p.email.toLowerCase() === emailLogado)) ||
    lar.pessoas[0]

  const inicialBaixa: PaymentFormInicial = {
    valor: ultimo ? centavosParaCampo(ultimo.valor) : "",
    dataPagamento: hoje,
    competencia,
    paidBy: pessoaLogada?.id ?? "",
  }
  const competenciasComLancamento = lancamentos.map((p) => p.competencia)

  // Comprovantes de todos os Lançamentos (ADR-0008) numa só consulta, já agrupados
  // por id — a lista pendura cada conjunto na sua linha (sem N+1).
  const comprovantesPorLancamento: Record<string, Attachment[]> =
    await listAttachmentsDeLancamentos(
      drizzleAttachmentRepo(),
      lar.id,
      lancamentos.map((p) => p.id),
    )

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[820px] flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[14px] border border-luc-border bg-luc-surface-2 p-5">
          <Button href="/areas/financas" variant="ghost" className="self-start">
            ← Finanças
          </Button>
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[11px] bg-luc-accent-12 text-luc-accent-bright">
              <BillIcon name={bill.icon} size={24} />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-extrabold text-2xl text-luc-text tracking-[-0.03em] sm:text-3xl">
                  {bill.nome}
                </h1>
                {bill.estado === "encerrada" && bill.encerradaEm && (
                  <Pill tone="muted">Encerrada · {formatarDataBr(bill.encerradaEm)}</Pill>
                )}
              </div>
              {bill.descricao && <p className="text-luc-text-3 leading-snug">{bill.descricao}</p>}
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px] text-luc-text-2">
                <span>{descreverRecorrencia(bill.recurrence)}</span>
                <span className="text-luc-faint">·</span>
                <span>{descreverVencimento(bill.dueRule, bill.dueMonthOffset)}</span>
              </div>
            </div>
          </div>
          <Button
            href={`/areas/financas/${bill.id}/editar`}
            variant="secondary"
            className="self-start"
          >
            Editar Conta
          </Button>
        </header>

        <Surface className="flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="text-sm font-bold text-luc-text-strong">Dar baixa</h2>
          {/* key pela contagem: depois de uma baixa o detalhe revalida e a
              contagem muda → o formulário remonta limpo (não retém os valores). */}
          <ConnectedPaymentForm
            key={`baixa-${lancamentos.length}`}
            action={criarLancamento.bind(null, bill.id)}
            pessoas={lar.pessoas}
            inicial={inicialBaixa}
            competenciasComLancamento={competenciasComLancamento}
          />
        </Surface>

        <section className="flex flex-col gap-5">
          <h2 className="text-sm font-bold text-luc-text-strong">
            Lançamentos{" "}
            {lancamentos.length > 0 && (
              <span className="text-luc-faint">· {lancamentos.length}</span>
            )}
          </h2>
          <LancamentosLista
            billId={bill.id}
            lancamentos={lancamentos}
            pessoas={lar.pessoas}
            recurrence={bill.recurrence}
            comprovantesPorLancamento={comprovantesPorLancamento}
          />
        </section>
      </div>
    </div>
  )
}
