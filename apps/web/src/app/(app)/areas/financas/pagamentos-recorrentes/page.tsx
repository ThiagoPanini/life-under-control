import { Calendar } from "lucide-react"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { criarLancamento } from "@/app/(app)/areas/financas/actions"
import { auth } from "@/auth"
import { Button } from "@/components/ds/Button"
import { PageHeader } from "@/components/ds/PageHeader"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { CenarioPagamentosMes } from "@/components/financas/CenarioPagamentosMes"
import { EncerradasSection } from "@/components/financas/EncerradasSection"
import { LancamentoRegistradoToast } from "@/components/financas/LancamentoRegistradoToast"
import { LinhaConta } from "@/components/financas/LinhaConta"
import { NovaContaModal } from "@/components/financas/NovaContaModal"
import { type BlocoPanorama, PanoramaContas } from "@/components/financas/PanoramaContas"
import { PendenciasAnterioresChip } from "@/components/financas/PendenciasAnterioresChip"
import { RegistrarPagamentoModal } from "@/components/financas/RegistrarPagamentoModal"
import { TotalPagoPorMes } from "@/components/financas/TotalPagoPorMes"
import { formatarDataBr } from "@/core/domain/bill"
import { centavosParaCampo, formatBRL } from "@/core/domain/money"
import { descreverCompetencia, ehCompetenciaValida } from "@/core/domain/payment"
import { derivarAnaliseHistorica } from "@/core/use-cases/derive-analise-historica"
import { derivarCenarioMes } from "@/core/use-cases/derive-cenario-mes"
import { listarPendenciasAnteriores } from "@/core/use-cases/derive-forma-competencia"
import { derivarLinhasContas } from "@/core/use-cases/derive-linha-conta"
import { derivarPanoramaMensal } from "@/core/use-cases/derive-panorama-mensal"
import { localAuthBypass } from "@/core/use-cases/gate"
import { getLogoUrl } from "@/core/use-cases/get-logo-url"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"
import { resolveAvatares } from "@/core/use-cases/resolve-avatares"
import { resolverUsuarioAutenticado } from "@/core/use-cases/resolve-usuario-autenticado"

// Lê o banco a cada request: nada de prerender estático no build (sem DB lá).
export const dynamic = "force-dynamic"

const EYEBROW = (
  <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-luc-faint">
    Finanças
  </span>
)

// Ocultos por #86 — componentes preservados no código para reprototipagem futura.
const MOSTRAR_PENDENCIAS_ANTERIORES = false
const MOSTRAR_CONTAS_ATIVAS = false
const MOSTRAR_ENCERRADAS = false

/** Cockpit do Assunto Pagamentos Recorrentes: a Análise do mês vigente no topo + lista de Contas e cadastro. */
export default async function FinancasPage({
  searchParams,
}: {
  searchParams: Promise<{
    nova?: string
    registrar?: string
    lancado?: string
    lancadoConta?: string
  }>
}) {
  const { nova, registrar, lancado, lancadoConta } = await searchParams
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const [bills, session] = await Promise.all([listBills(drizzleBillRepo(), lar.id), auth()])
  const ativas = bills.filter((b) => b.estado === "ativa")
  const encerradas = bills.filter((b) => b.estado === "encerrada")

  // A Análise soma o Lar inteiro — uma só leitura de todos os Lançamentos das
  // Contas ativas (sem N+1 por Conta).
  const pagamentos = await listAllPayments(drizzlePaymentRepo(), lar.id)
  const hoje = systemClock().hoje()
  const cenario = derivarCenarioMes(systemClock(), ativas, pagamentos)
  // Análise Histórica (#98): 12 Competências de Total Pago sobre TODOS os
  // Lançamentos do Lar (inclui splits e fatos de Contas encerradas) — a janela é
  // aritmética de mês civil (só Clock, sem Calendar). Vive mesmo sem Conta ativa,
  // desde que haja fato na janela.
  const serieHistorica = derivarAnaliseHistorica(systemClock(), pagamentos)
  const pendenciasAnteriores = listarPendenciasAnteriores(
    nationalBankCalendar(),
    ativas,
    pagamentos,
    cenario.competencia,
  )

  // Logo das Contas que têm (#50): a URL assinada é presign local (sem rede),
  // então resolver todas de uma vez é barato — sem N+1 real.
  const store = r2AttachmentStore()
  const logoUrls = new Map(
    await Promise.all(
      bills
        .filter((bill) => bill.logoKey)
        .map(async (bill) => [bill.id, await getLogoUrl(store, bill.logoKey)] as const),
    ),
  )

  // Linha híbrida (#56): urgência + grid + valor estado-dependente, já ordenada.
  // Só alimenta o bloco "Contas ativas", hoje desligado — não deriva à toa.
  const linhas = MOSTRAR_CONTAS_ATIVAS
    ? derivarLinhasContas(systemClock(), nationalBankCalendar(), ativas, pagamentos)
    : []
  const pessoasComAvatar = await resolveAvatares(lar.pessoas, store)
  const billsPorId = new Map(ativas.map((bill) => [bill.id, bill]))

  // Panorama (Final): a derivação única (#93) já traz estado, valor somado
  // (baixas fracionadas) e ordem de urgência — a borda só junta nome/logo e a
  // rota da baixa, sem recalcular domínio nem varrer Lançamentos por Conta.
  const cards = derivarPanoramaMensal(systemClock(), nationalBankCalendar(), ativas, pagamentos)
  const blocos: BlocoPanorama[] = cards.flatMap((card) => {
    const bill = billsPorId.get(card.billId)
    if (!bill) return []
    return [
      {
        billId: card.billId,
        nome: bill.nome,
        icon: bill.icon,
        logoUrl: logoUrls.get(bill.id) ?? null,
        estado: card.estado,
        frase: card.frase,
        valor: card.valor,
        registrarHref:
          card.estado === "pago"
            ? null
            : `/areas/financas/pagamentos-recorrentes?registrar=${bill.id}`,
      },
    ]
  })

  // Baixa direta do bloco (Final): modal compacto na própria página, com a
  // competência fixa da ocorrência vigente. Defaults iguais aos do detalhe —
  // valor do último Lançamento, hoje, Pessoa logada (casada por e-mail).
  const cardRegistrar = registrar ? cards.find((card) => card.billId === registrar) : undefined
  const billRegistrar = cardRegistrar ? billsPorId.get(cardRegistrar.billId) : undefined
  // Autoria default: a Pessoa da sessão, resolvida pelo MESMO use-case da casca
  // (issue #94) — casa pelo e-mail Google vinculado, nunca pela posição no Lar.
  // Sob bypass, ignora a sessão real (como a layout) pra operar contra o seed.
  // Sem vínculo, `pessoaLogada` fica `undefined` e o modal deixa "quem pagou" em
  // branco (o domínio exige a escolha) — nunca defaulta pra Pessoa errada.
  const bypass = localAuthBypass(
    process.env.NODE_ENV ?? "development",
    process.env.LUC_LOCAL_AUTH_BYPASS,
  )
  const emailLogado = bypass ? undefined : session?.user?.email
  const pessoaLogada = resolverUsuarioAutenticado(pessoasComAvatar, emailLogado, bypass)
  const lancamentosRegistrar = billRegistrar
    ? pagamentos
        .filter((p) => p.billId === billRegistrar.id)
        .sort((a, b) =>
          `${b.competencia}:${b.dataPagamento ?? ""}`.localeCompare(
            `${a.competencia}:${a.dataPagamento ?? ""}`,
          ),
        )
    : []
  const ultimoRegistrar = lancamentosRegistrar[0]

  // Toast pós-baixa: `lancadoConta` + `lancado` válidos — a mesma mensagem do detalhe.
  const billLancado = lancadoConta ? billsPorId.get(lancadoConta) : undefined
  const lancadoValido = ehCompetenciaValida(lancado ?? "") ? (lancado as string) : null

  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      {billLancado && lancadoValido && (
        <LancamentoRegistradoToast
          mensagem={`Lançamento registrado — ${billLancado.nome} · ${descreverCompetencia(lancadoValido, billLancado.recurrence)}`}
        />
      )}
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[26px]">
        <PageHeader
          eyebrow={EYEBROW}
          title="Pagamentos Recorrentes"
          description="Gerenciamento de Contas e pagamentos recorrentes (normalmente mensais) relevantes para o casal."
        />

        {ativas.length > 0 && (
          <section aria-labelledby="analise-heading" className="flex flex-col gap-[18px]">
            <SectionHeading
              id="analise-heading"
              title="Análise do mês vigente"
              variant="destaque"
              icon={
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
                  <Calendar aria-hidden size={15} />
                </span>
              }
            />
            <PanoramaContas blocos={blocos} />
            <div className="flex flex-col gap-2.5">
              <CenarioPagamentosMes cenario={cenario} />
              {MOSTRAR_PENDENCIAS_ANTERIORES && (
                <PendenciasAnterioresChip pendencias={pendenciasAnteriores} />
              )}
            </div>
          </section>
        )}

        {/* Análise Histórica (#98): fora do gate `ativas>0` — a série vive só de fatos na janela. */}
        <TotalPagoPorMes serie={serieHistorica} />

        {MOSTRAR_CONTAS_ATIVAS && (
          <section aria-labelledby="contas-ativas-heading" className="flex flex-col gap-5">
            <SectionHeading
              id="contas-ativas-heading"
              title="Contas ativas"
              suffix={ativas.length > 0 ? `· ${ativas.length}` : undefined}
              subtitle="Estado de cada Conta neste mês · o valor real nasce na quitação"
            />

            {ativas.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-1 p-8">
                <p className="text-luc-text-2 leading-relaxed">
                  Nenhuma Conta ativa. Cadastre a primeira regra de pagamento recorrente — a Conta
                  guarda o <em>quando</em>, nunca o <em>quanto</em>.
                </p>
                <Button href="/areas/financas/pagamentos-recorrentes/nova" variant="secondary">
                  Cadastrar Conta
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {linhas.map((linha) => {
                  const bill = billsPorId.get(linha.billId)
                  if (!bill) return null
                  return (
                    <LinhaConta
                      key={linha.billId}
                      bill={bill}
                      linha={linha}
                      logoUrl={logoUrls.get(bill.id)}
                      pessoas={pessoasComAvatar}
                      lancamentos={pagamentos.filter((payment) => payment.billId === bill.id)}
                    />
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {MOSTRAR_ENCERRADAS && <EncerradasSection bills={encerradas} logoUrls={logoUrls} />}
      </div>
      {nova === "1" && <NovaContaModal closeHref="/areas/financas/pagamentos-recorrentes" />}
      {billRegistrar && cardRegistrar && (
        <RegistrarPagamentoModal
          key={`registro-${billRegistrar.id}-${lancamentosRegistrar.length}`}
          billId={billRegistrar.id}
          billName={billRegistrar.nome}
          billIcon={billRegistrar.icon}
          action={criarLancamento.bind(null, billRegistrar.id)}
          pessoas={pessoasComAvatar}
          inicial={{
            valor: ultimoRegistrar ? centavosParaCampo(ultimoRegistrar.valor) : "",
            dataPagamento: hoje,
            competencia: cardRegistrar.competencia,
            paidBy: pessoaLogada?.id ?? "",
          }}
          competenciasComLancamento={lancamentosRegistrar.map((p) => p.competencia)}
          contexto={`competência ${descreverCompetencia(cardRegistrar.competencia, billRegistrar.recurrence)} · ${cardRegistrar.frase} (${formatarDataBr(cardRegistrar.vencimento).slice(0, 5)})`}
          notaValor={
            cardRegistrar.media != null
              ? `estimativa pelo histórico: ≈ ${formatBRL(cardRegistrar.media)} — o valor exato nasce agora, no Lançamento`
              : undefined
          }
          closeHref="/areas/financas/pagamentos-recorrentes"
          successHref={`/areas/financas/pagamentos-recorrentes?lancadoConta=${billRegistrar.id}`}
        />
      )}
    </div>
  )
}
