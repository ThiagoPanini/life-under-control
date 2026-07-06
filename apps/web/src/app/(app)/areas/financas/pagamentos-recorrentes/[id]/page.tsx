import { notFound } from "next/navigation"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleAttachmentRepo } from "@/adapters/db/attachment-repo.drizzle"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { criarLancamento, editarConta } from "@/app/(app)/areas/financas/actions"
import { auth } from "@/auth"
import { Button } from "@/components/ds/Button"
import { MetricCard } from "@/components/ds/MetricCard"
import { Pill } from "@/components/ds/Pill"
import { FAROL } from "@/components/financas/BillCard"
import { BillLogoTile } from "@/components/financas/BillLogoTile"
import { billParaInicial } from "@/components/financas/bill-form-inicial"
import { ContaEditadaToast } from "@/components/financas/ContaEditadaToast"
import { EditarContaModal } from "@/components/financas/EditarContaModal"
import { HistoriaConta } from "@/components/financas/HistoriaConta"
import { LancamentoRegistradoToast } from "@/components/financas/LancamentoRegistradoToast"
import { LancamentosLista } from "@/components/financas/LancamentosLista"
import { PaymentWizardModal } from "@/components/financas/PaymentWizardModal"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { Attachment } from "@/core/domain/attachment"
import { descreverRecorrencia, descreverVencimento, formatarDataBr } from "@/core/domain/bill"
import { centavosParaCampo, formatBRL } from "@/core/domain/money"
import { descreverCompetencia, ehCompetenciaValida } from "@/core/domain/payment"
import { resumoDeExclusao } from "@/core/use-cases/delete-bill"
import {
  competenciaDefaultBaixaDoGrid,
  derivarCardConta,
  resumoPagamentos,
} from "@/core/use-cases/derive-bill-card"
import {
  farolDaOcorrencia,
  fraseDaOcorrencia,
  leituraLongaDaOcorrencia,
  type Ocorrencia,
} from "@/core/use-cases/derive-estado-ocorrencia"
import { detalharPontualidadeDaConta } from "@/core/use-cases/derive-pontualidade"
import { localAuthBypass } from "@/core/use-cases/gate"
import { getBill } from "@/core/use-cases/get-bill"
import { getLogoUrl } from "@/core/use-cases/get-logo-url"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAttachmentsDeLancamentos } from "@/core/use-cases/list-attachments"
import { listPayments } from "@/core/use-cases/list-payments"
import { resolveAvatares } from "@/core/use-cases/resolve-avatares"
import { resolverUsuarioAutenticado } from "@/core/use-cases/resolve-usuario-autenticado"

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
  searchParams: Promise<{
    competencia?: string
    lancado?: string
    registrar?: string
    editar?: string
    editado?: string
  }>
}) {
  const { id } = await params
  const {
    competencia: compParam,
    lancado: lancadoParam,
    registrar,
    editar,
    editado,
  } = await searchParams

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

  const hoje = systemClock().hoje()

  // Card derivado (#21/#59): a leitura (Instrumentos/História) vale pra Conta
  // encerrada também — é histórico, não muda com o fim da Conta. Só o "vigente"
  // (pílula/leitura longa, que projetam o "quando" do PRÓXIMO vencimento) é
  // exclusivo de Conta ativa; encerrada não tem um vencimento por vir.
  const card = derivarCardConta(systemClock(), nationalBankCalendar(), bill, lancamentos)

  // Defaults da baixa: hoje (via Clock), a competência pedida por um ponto de
  // entrada (#23/#56/#63) ou — sem pedido — a ocorrência em aberto mais antiga
  // do grid já derivado acima (a Internet atrasada de junho baixa em junho,
  // não em julho); o valor do último Lançamento e a Pessoa logada como autor.
  const competencia = ehCompetenciaValida(compParam ?? "")
    ? (compParam as string)
    : competenciaDefaultBaixaDoGrid(card.grid)
  const ultimo = lancamentos[0]
  // Encerrada não projeta ocorrência além do próprio fechamento — recorta o grid
  // no `encerradaEm` pra não fingir "em aberto" competência depois que a Conta
  // parou de existir (a mesma lógica de `competenciasEsperadas` em #48/#55).
  const gridRelevante =
    bill.estado === "encerrada" && bill.encerradaEm
      ? card.grid.filter((celula) => celula.vencimento <= (bill.encerradaEm as string))
      : card.grid
  const { media: mediaRelevante } = resumoPagamentos(gridRelevante)
  const pontualidade = detalharPontualidadeDaConta(gridRelevante)

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
  // "Quem pagou" default = a Pessoa logada, resolvida pelo MESMO use-case da casca
  // (issue #94): casa pelo e-mail Google vinculado, nunca pela posição no Lar. Sob
  // bypass ignora a sessão real (opera contra o seed). Sem vínculo fica `undefined`
  // e o campo nasce em branco (o domínio exige a escolha) — jamais a Pessoa errada.
  const bypass = localAuthBypass(
    process.env.NODE_ENV ?? "development",
    process.env.LUC_LOCAL_AUTH_BYPASS,
  )
  const emailLogado = bypass ? undefined : session?.user?.email
  const pessoaLogada = resolverUsuarioAutenticado(lar.pessoas, emailLogado, bypass)

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

  const lancadoValido = ehCompetenciaValida(lancadoParam ?? "") ? (lancadoParam as string) : null
  const detalheHref = `/areas/financas/pagamentos-recorrentes/${bill.id}`
  const abrirRegistro = registrar === "1" || ehCompetenciaValida(compParam ?? "")
  const abrirEdicao = editar === bill.id
  // Ciclo de vida (#143): a contagem de dependentes só é lida quando o modal de
  // edição abre — o rodapé mostra a mesma contagem honesta do gesto de deletar.
  // Falha aqui degrada (null bloqueia o armar no rodapé), não derruba a página.
  const dependentesEdicao = abrirEdicao
    ? await resumoDeExclusao(drizzleBillRepo(), lar.id, bill.id).catch(() => null)
    : { lancamentos: 0, anexos: 0 }
  const registrarHref = `${detalheHref}?registrar=1&competencia=${encodeURIComponent(competencia)}`

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      {lancadoValido && (
        <LancamentoRegistradoToast
          mensagem={`Lançamento registrado — ${bill.nome} · ${descreverCompetencia(lancadoValido, bill.recurrence)}`}
        />
      )}
      {editado === bill.id && <ContaEditadaToast mensagem={`Conta atualizada — ${bill.nome}`} />}
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
          <div className="flex flex-wrap gap-2">
            {bill.estado === "ativa" && (
              <Button href={registrarHref} variant="primary">
                Registrar pagamento
              </Button>
            )}
            <Button href={`${detalheHref}?editar=${bill.id}`} variant="secondary">
              Editar Conta
            </Button>
          </div>
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
              support={pontualidade.estado === "calculada" ? pontualidade.frase : undefined}
            />
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-sm font-bold text-luc-text-strong">
            História <span className="text-luc-faint">· {gridRelevante.length} competências</span>
          </h2>
          <HistoriaConta grid={gridRelevante} />
        </section>

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
      {abrirRegistro && bill.estado === "ativa" && (
        <PaymentWizardModal
          // key estável por Conta — sem a contagem de Lançamentos (que sobe no
          // refresh do sucesso e remontaria o modal, ressuscitando o aviso).
          key={`registro-${bill.id}`}
          billId={bill.id}
          billName={bill.nome}
          action={criarLancamento.bind(null, bill.id)}
          pessoas={pessoasComAvatar}
          inicial={inicialBaixa}
          competenciasComLancamento={competenciasComLancamento}
          closeHref={detalheHref}
        />
      )}
      {abrirEdicao && (
        <EditarContaModal
          key={`editar-${bill.id}`}
          billId={bill.id}
          billName={bill.nome}
          billIcon={bill.icon}
          logoUrl={logoUrl}
          contexto={`recorrência ${descreverRecorrencia(bill.recurrence).toLowerCase()} · o valor nasce em cada Lançamento`}
          inicial={billParaInicial(bill)}
          action={editarConta.bind(null, bill.id, detalheHref)}
          closeHref={detalheHref}
          estado={bill.estado}
          encerradaEm={bill.encerradaEm}
          hoje={hoje}
          dependentes={dependentesEdicao}
        />
      )}
    </div>
  )
}
