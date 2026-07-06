import { Calendar } from "lucide-react"
import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import {
  criarLancamento,
  edicaoRapidaConta,
  excluirConta,
} from "@/app/(app)/areas/financas/actions"
import { auth } from "@/auth"
import { Button } from "@/components/ds/Button"
import { PageHeader } from "@/components/ds/PageHeader"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { CenarioPagamentosMes } from "@/components/financas/CenarioPagamentosMes"
import { ContaEditadaToast } from "@/components/financas/ContaEditadaToast"
import { ContaExcluidaToast } from "@/components/financas/ContaExcluidaToast"
import { EditarContaModal } from "@/components/financas/EditarContaModal"
import { ExcluirContaModal } from "@/components/financas/ExcluirContaModal"
import { LancamentoRegistradoToast } from "@/components/financas/LancamentoRegistradoToast"
import { mensagemLancamentoRegistrado } from "@/components/financas/lancamento-toast"
import { MapaDoAno } from "@/components/financas/MapaDoAno"
import { NovaContaButton } from "@/components/financas/NovaContaButton"
import { NovaContaModal } from "@/components/financas/NovaContaModal"
import { type BlocoPanorama, PanoramaContas } from "@/components/financas/PanoramaContas"
import { PendenciasAnterioresChip } from "@/components/financas/PendenciasAnterioresChip"
import { RegistrarPagamentoModal } from "@/components/financas/RegistrarPagamentoModal"
import { TotalPagoPorMes } from "@/components/financas/TotalPagoPorMes"
import {
  type ItemAnalitico,
  VisaoAnaliticaContas,
} from "@/components/financas/VisaoAnaliticaContas"
import { descreverRecorrencia, descreverVencimento, formatarDataBr } from "@/core/domain/bill"
import { centavosParaCampo, formatBRLSemCentavos } from "@/core/domain/money"
import { descreverCompetencia, ehCompetenciaValida } from "@/core/domain/payment"
import { derivarAnaliseHistorica } from "@/core/use-cases/derive-analise-historica"
import { derivarCenarioMes } from "@/core/use-cases/derive-cenario-mes"
import { derivarDestaquesMes } from "@/core/use-cases/derive-destaques-mes"
import { listarPendenciasAnteriores } from "@/core/use-cases/derive-forma-competencia"
import { derivarMapaAno } from "@/core/use-cases/derive-mapa-ano"
import { derivarPanoramaMensal } from "@/core/use-cases/derive-panorama-mensal"
import { derivarVisaoAnaliticaContas } from "@/core/use-cases/derive-visao-analitica"
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

// Oculto por #86 — o chip de pendências anteriores segue guardado para reprototipagem.
const MOSTRAR_PENDENCIAS_ANTERIORES = false

/** Cockpit do Assunto Pagamentos Recorrentes: a Análise do mês vigente no topo + lista de Contas e cadastro. */
export default async function FinancasPage({
  searchParams,
}: {
  searchParams: Promise<{
    nova?: string
    registrar?: string
    editar?: string
    editado?: string
    excluir?: string
    excluido?: string
    lancado?: string
    lancadoConta?: string
    valor?: string
    comprovantes?: string
  }>
}) {
  const {
    nova,
    registrar,
    editar,
    editado,
    excluir,
    excluido,
    lancado,
    lancadoConta,
    valor,
    comprovantes,
  } = await searchParams
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
  // Destaques do último mês fechado (#101): maior alta/queda por Conta e maior
  // Lançamento individual. Deriva de `bills` (inclui encerradas, para resolver o
  // nome) e do mesmo array de Lançamentos — sem query nova.
  const destaques = derivarDestaquesMes(systemClock(), bills, pagamentos)
  // Mapa do Ano (#102): a matriz Conta × Competência das 12 Competências até a
  // atual. Deriva de TODAS as Contas (encerradas incluídas — aparecem enquanto a
  // vigência intercepta a janela) e do mesmo array de Lançamentos, sem query nova.
  const mapaAno = derivarMapaAno(systemClock(), nationalBankCalendar(), bills, pagamentos)
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

  const pessoasComAvatar = await resolveAvatares(lar.pessoas, store)
  const billsPorId = new Map(ativas.map((bill) => [bill.id, bill]))

  // Visão Analítica por Conta (#127): uma linha por Conta (ativas na ordem de
  // urgência do Panorama; encerradas ao fim), com sinaleiro + pontualidade +
  // sparkline + valor/estado da ocorrência vigente. Deriva com `incluirEncerradas`
  // — o switch da seção filtra a exibição na borda (default: só ativas). A borda
  // junta nome/logo/vencimento e a data de baixa por Competência (tooltip).
  const linhasAnaliticas = derivarVisaoAnaliticaContas(
    systemClock(),
    nationalBankCalendar(),
    bills,
    pagamentos,
    { incluirEncerradas: true },
  )
  const billsPorIdTodas = new Map(bills.map((bill) => [bill.id, bill]))
  const itensAnaliticos: ItemAnalitico[] = linhasAnaliticas.flatMap((linha) => {
    const bill = billsPorIdTodas.get(linha.billId)
    if (!bill) return []
    const datasPagamento: Record<string, string> = {}
    for (const p of pagamentos) {
      if (p.billId !== bill.id || !p.dataPagamento) continue
      const atual = datasPagamento[p.competencia]
      if (atual == null || p.dataPagamento > atual) datasPagamento[p.competencia] = p.dataPagamento
    }
    return [
      {
        linha,
        nome: bill.nome,
        icon: bill.icon,
        logoUrl: logoUrls.get(bill.id) ?? null,
        vencimentoDesc: descreverVencimento(bill.dueRule, bill.dueMonthOffset),
        datasPagamento,
      },
    ]
  })

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
        editarHref: `/areas/financas/pagamentos-recorrentes?editar=${bill.id}`,
        excluirHref: `/areas/financas/pagamentos-recorrentes?excluir=${bill.id}`,
      },
    ]
  })

  // Edição rápida pelo card (#97): o lápis abre `?editar=<id>` num modal
  // compacto, preenchido com o estado atual da Conta (nome · ícone · vencimento
  // simples · logo). A regra completa segue na página de edição.
  const billEditar = editar ? billsPorId.get(editar) : undefined
  // Toast pós-edição rápida: `?editado=<id>` de uma Conta ativa conhecida.
  const billEditado = editado ? billsPorId.get(editado) : undefined

  // Exclusão pelo card (#99): `?excluir=<id>` abre a confirmação compacta (a
  // Conta ainda está ativa). Após confirmar, `?excluido=<id>` levanta o toast com
  // Desfazer — a Conta já é `encerrada`, então o nome vem de `encerradas` (e não
  // de `bills`): assim um Back do navegador pra `?excluido=<id>` DEPOIS do Desfazer,
  // com a Conta já reativada, não ressuscita um toast enganoso de "Conta excluída".
  const billExcluir = excluir ? billsPorId.get(excluir) : undefined
  const billExcluido = excluido ? encerradas.find((b) => b.id === excluido) : undefined

  // Baixa direta do bloco (Final): modal compacto na própria página, com a
  // competência fixa da ocorrência vigente. Defaults iguais aos do detalhe —
  // valor do último Lançamento, hoje, Pessoa logada (casada por e-mail).
  // O registro nasce da ocorrência **vigente** de qualquer Conta ativa (inclusive
  // não mensal fora de fase, que o Panorama não lista) — resolve pela Visão
  // Analítica, não só pelo Panorama. Encerrada não registra.
  const linhaRegistrar = registrar
    ? linhasAnaliticas.find((l) => l.billId === registrar && !l.encerrada)
    : undefined
  const billRegistrar = linhaRegistrar ? billsPorId.get(linhaRegistrar.billId) : undefined
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

  // Toast pós-baixa: `lancadoConta` + `lancado` válidos. O modal compacto (#100)
  // ainda anexa `valor` (centavos) e `comprovantes` (nº associado) para a mensagem
  // identificar os três; sem eles cai na forma antiga (Conta · competência).
  const billLancado = lancadoConta ? billsPorId.get(lancadoConta) : undefined
  const lancadoValido = ehCompetenciaValida(lancado ?? "") ? (lancado as string) : null
  const valorLancado = valor && /^\d+$/.test(valor) ? Number(valor) : null
  const comprovantesLancados = comprovantes && /^\d+$/.test(comprovantes) ? Number(comprovantes) : 0

  return (
    <div className="luc-page-gutter py-7 sm:pt-[26px] sm:pb-[72px]">
      {billLancado && lancadoValido && (
        <LancamentoRegistradoToast
          mensagem={
            valorLancado != null
              ? mensagemLancamentoRegistrado(billLancado.nome, valorLancado, comprovantesLancados)
              : `Lançamento registrado — ${billLancado.nome} · ${descreverCompetencia(lancadoValido, billLancado.recurrence)}`
          }
        />
      )}
      {billEditado && <ContaEditadaToast mensagem={`Conta atualizada — ${billEditado.nome}`} />}
      {billExcluido && (
        <ContaExcluidaToast
          mensagem={`Conta excluída — ${billExcluido.nome}`}
          billId={billExcluido.id}
        />
      )}
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[26px]">
        <PageHeader
          eyebrow={EYEBROW}
          title="Pagamentos Recorrentes"
          description="Gerenciamento de Contas e pagamentos recorrentes (normalmente mensais) relevantes para o casal"
          actions={<NovaContaButton />}
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
        <TotalPagoPorMes serie={serieHistorica} destaques={destaques} hoje={hoje} />

        {/* Visão Analítica por Conta (#127): vive de
            vigência (encerradas entram com o switch), some quando não há Conta. */}
        <VisaoAnaliticaContas itens={itensAnaliticos} />

        {/* Mapa do Ano (#102): a matriz de vigência real das Contas — vive de vigência,
            não do gate `ativas>0` (Contas encerradas na janela aparecem). */}
        <MapaDoAno mapa={mapaAno} />

        {bills.length === 0 && (
          <div className="flex flex-col items-start gap-4 rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-1 p-8">
            <p className="text-luc-text-2 leading-relaxed">
              Nenhuma Conta cadastrada. Cadastre a primeira regra de pagamento recorrente — a Conta
              guarda o <em>quando</em>, nunca o <em>quanto</em>.
            </p>
            <Button href="/areas/financas/pagamentos-recorrentes/nova" variant="secondary">
              Cadastrar Conta
            </Button>
          </div>
        )}
      </div>
      {nova === "1" && <NovaContaModal closeHref="/areas/financas/pagamentos-recorrentes" />}
      {billEditar && (
        <EditarContaModal
          key={`editar-${billEditar.id}`}
          billId={billEditar.id}
          billName={billEditar.nome}
          billIcon={billEditar.icon}
          logoUrl={logoUrls.get(billEditar.id) ?? null}
          contexto={`recorrência ${descreverRecorrencia(billEditar.recurrence).toLowerCase()} · o valor nasce em cada Lançamento`}
          inicial={{
            nome: billEditar.nome,
            icon: billEditar.icon,
            dueRuleKind: billEditar.dueRule.kind,
            dueRuleDay:
              billEditar.dueRule.kind === "dia-fixo" ? String(billEditar.dueRule.day) : "10",
          }}
          action={edicaoRapidaConta.bind(null, billEditar.id)}
          closeHref="/areas/financas/pagamentos-recorrentes"
        />
      )}
      {billExcluir && (
        <ExcluirContaModal
          key={`excluir-${billExcluir.id}`}
          billName={billExcluir.nome}
          action={excluirConta.bind(null, billExcluir.id)}
          closeHref="/areas/financas/pagamentos-recorrentes"
        />
      )}
      {billRegistrar && linhaRegistrar && (
        <RegistrarPagamentoModal
          key={`registro-${billRegistrar.id}-${lancamentosRegistrar.length}`}
          billId={billRegistrar.id}
          billName={billRegistrar.nome}
          billIcon={billRegistrar.icon}
          logoUrl={logoUrls.get(billRegistrar.id) ?? null}
          action={criarLancamento.bind(null, billRegistrar.id)}
          pessoas={pessoasComAvatar}
          inicial={{
            valor: ultimoRegistrar ? centavosParaCampo(ultimoRegistrar.valor) : "",
            dataPagamento: hoje,
            competencia: linhaRegistrar.competenciaVigente,
            paidBy: pessoaLogada?.id ?? "",
          }}
          competenciasComLancamento={lancamentosRegistrar.map((p) => p.competencia)}
          contexto={`competência ${descreverCompetencia(linhaRegistrar.competenciaVigente, billRegistrar.recurrence)} · ${linhaRegistrar.frase} (${formatarDataBr(linhaRegistrar.vencimento).slice(0, 5)})`}
          notaValor={
            linhaRegistrar.media != null
              ? `estimativa pelo histórico: ≈ ${formatBRLSemCentavos(linhaRegistrar.media)} — o valor exato nasce agora, no Lançamento`
              : undefined
          }
          closeHref="/areas/financas/pagamentos-recorrentes"
          successHref={`/areas/financas/pagamentos-recorrentes?lancadoConta=${billRegistrar.id}`}
        />
      )}
    </div>
  )
}
