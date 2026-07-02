import { notFound } from "next/navigation"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleAttachmentRepo } from "@/adapters/db/attachment-repo.drizzle"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { criarLancamento } from "@/app/(app)/areas/financas/actions"
import { auth } from "@/auth"
import { Button } from "@/components/ds/Button"
import { MetricCard } from "@/components/ds/MetricCard"
import { Pill } from "@/components/ds/Pill"
import { Surface } from "@/components/ds/Surface"
import { FAROL } from "@/components/financas/BillCard"
import { BillLogoTile } from "@/components/financas/BillLogoTile"
import { ConnectedPaymentForm } from "@/components/financas/ConnectedPaymentForm"
import { HistoriaConta } from "@/components/financas/HistoriaConta"
import { LancamentosLista } from "@/components/financas/LancamentosLista"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { Attachment } from "@/core/domain/attachment"
import { descreverRecorrencia, descreverVencimento, formatarDataBr } from "@/core/domain/bill"
import { centavosParaCampo, formatBRL } from "@/core/domain/money"
import { descreverCompetencia, ehCompetenciaValida } from "@/core/domain/payment"
import { derivarCardConta, resumoPagamentos } from "@/core/use-cases/derive-bill-card"
import {
  farolDaOcorrencia,
  fraseDaOcorrencia,
  leituraLongaDaOcorrencia,
  type Ocorrencia,
} from "@/core/use-cases/derive-estado-ocorrencia"
import { calcularPontualidadeDaConta } from "@/core/use-cases/derive-pontualidade"
import { getBill } from "@/core/use-cases/get-bill"
import { getLogoUrl } from "@/core/use-cases/get-logo-url"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAttachmentsDeLancamentos } from "@/core/use-cases/list-attachments"
import { listPayments } from "@/core/use-cases/list-payments"
import { resolveAvatares } from "@/core/use-cases/resolve-avatares"

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
  const [bill, lancamentos, session, pessoasComAvatar] = await Promise.all([
    getBill(drizzleBillRepo(), lar.id, id),
    listPayments(drizzlePaymentRepo(), lar.id, id),
    auth(),
    resolveAvatares(lar.pessoas, r2AttachmentStore()),
  ])
  if (!bill) notFound()

  // Logo da Conta (#50): a URL assinada é presign local (sem rede).
  const logoUrl = await getLogoUrl(r2AttachmentStore(), bill.logoKey)

  // Defaults da baixa: hoje (via Clock), a competência pedida (Agenda, #23) ou o
  // mês corrente, o valor do último Lançamento e a Pessoa logada como autor.
  const hoje = systemClock().hoje()
  const competencia = ehCompetenciaValida(compParam ?? "")
    ? (compParam as string)
    : hoje.slice(0, 7)
  const ultimo = lancamentos[0]

  // Card derivado (#21/#59): a leitura (Instrumentos/História) vale pra Conta
  // encerrada também — é histórico, não muda com o fim da Conta. Só o "vigente"
  // (pílula/leitura longa, que projetam o "quando" do PRÓXIMO vencimento) é
  // exclusivo de Conta ativa; encerrada não tem um vencimento por vir.
  const card = derivarCardConta(systemClock(), nationalBankCalendar(), bill, lancamentos)
  // Encerrada não projeta ocorrência além do próprio fechamento — recorta o grid
  // no `encerradaEm` pra não fingir "em aberto" competência depois que a Conta
  // parou de existir (a mesma lógica de `competenciasEsperadas` em #48/#55).
  const gridRelevante =
    bill.estado === "encerrada" && bill.encerradaEm
      ? card.grid.filter((celula) => celula.vencimento <= (bill.encerradaEm as string))
      : card.grid
  const { media: mediaRelevante } = resumoPagamentos(gridRelevante)
  const pontualidade = calcularPontualidadeDaConta(gridRelevante)

  const celulaVigente = card.grid[card.grid.length - 1]
  const ocorrenciaVigente: Ocorrencia | null =
    bill.estado === "ativa"
      ? {
          vencimento: celulaVigente.vencimento,
          competencia: celulaVigente.competencia,
          recurrence: bill.recurrence,
          quitada: celulaVigente.valor != null,
        }
      : null
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
          <Button
            href="/areas/financas/pagamentos-recorrentes"
            variant="ghost"
            className="self-start"
          >
            ← Pagamentos Recorrentes
          </Button>
          <div className="flex items-start gap-4">
            <BillLogoTile icon={bill.icon} logoUrl={logoUrl} size={48} iconSize={24} />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-extrabold text-2xl text-luc-text tracking-[-0.03em] sm:text-3xl">
                  {bill.nome}
                </h1>
                {bill.estado === "encerrada" && bill.encerradaEm && (
                  <Pill tone="muted">Encerrada · {formatarDataBr(bill.encerradaEm)}</Pill>
                )}
                {ocorrenciaVigente &&
                  (() => {
                    const farol = FAROL[farolDaOcorrencia(ocorrenciaVigente, hoje)]
                    return (
                      <Pill tone={farol.tone}>
                        <span aria-hidden className={`h-2 w-2 rounded-full ${farol.dot}`} />
                        {fraseDaOcorrencia(ocorrenciaVigente, hoje)}
                      </Pill>
                    )
                  })()}
              </div>
              {bill.descricao && <p className="text-luc-text-3 leading-snug">{bill.descricao}</p>}
              {ocorrenciaVigente && (
                <p className="text-[12.5px] text-luc-text-2">
                  {leituraLongaDaOcorrencia(ocorrenciaVigente, hoje)}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px] text-luc-text-2">
                <span>{descreverRecorrencia(bill.recurrence)}</span>
                <span className="text-luc-faint">·</span>
                <span>{descreverVencimento(bill.dueRule, bill.dueMonthOffset)}</span>
              </div>
            </div>
          </div>
          <Button
            href={`/areas/financas/pagamentos-recorrentes/${bill.id}/editar`}
            variant="secondary"
            className="self-start"
          >
            Editar Conta
          </Button>
        </header>

        <section aria-labelledby="instrumentos-heading" className="flex flex-col gap-3">
          <h2 id="instrumentos-heading" className="text-sm font-bold text-luc-text-strong">
            Instrumentos
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Último Lançamento"
              value={ultimo ? formatBRL(ultimo.valor) : "—"}
              support={
                ultimo
                  ? descreverCompetencia(ultimo.competencia, bill.recurrence)
                  : "sem Lançamento ainda"
              }
            />
            <MetricCard
              label="Média 12m"
              value={mediaRelevante == null ? "—" : formatBRL(mediaRelevante)}
            />
            <MetricCard
              label="Pontualidade 12m"
              value={pontualidade.estado === "sem-historico" ? "—" : `${pontualidade.percentual}%`}
              support={
                pontualidade.estado === "calculada"
                  ? `${pontualidade.percentual}% dos vencimentos no prazo`
                  : undefined
              }
            />
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-sm font-bold text-luc-text-strong">
            História <span className="text-luc-faint">· {gridRelevante.length} competências</span>
          </h2>
          <HistoriaConta grid={gridRelevante} />
        </section>

        <Surface id="dar-baixa" className="flex scroll-mt-6 flex-col gap-5 p-5 sm:p-6">
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
            pessoas={pessoasComAvatar}
            recurrence={bill.recurrence}
            comprovantesPorLancamento={comprovantesPorLancamento}
          />
          {lancamentos.length > 0 && (
            <p className="text-[11px] text-luc-faint leading-relaxed">
              o Lançamento fotografa o valor do momento — reajustar a Conta nunca reescreve o
              passado
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
