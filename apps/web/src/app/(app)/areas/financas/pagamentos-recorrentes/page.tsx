import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { Button } from "@/components/ds/Button"
import { PageHeader } from "@/components/ds/PageHeader"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { CenarioPagamentosMes } from "@/components/financas/CenarioPagamentosMes"
import { EncerradasSection } from "@/components/financas/EncerradasSection"
import { LinhaConta } from "@/components/financas/LinhaConta"
import { NovaContaModal } from "@/components/financas/NovaContaModal"
import { type BlocoPanorama, PanoramaContas } from "@/components/financas/PanoramaContas"
import { PendenciasAnterioresChip } from "@/components/financas/PendenciasAnterioresChip"
import { formatarDataBr } from "@/core/domain/bill"
import { derivarCenarioMes } from "@/core/use-cases/derive-cenario-mes"
import { listarPendenciasAnteriores } from "@/core/use-cases/derive-forma-competencia"
import { derivarLinhasContas, type LinhaConta as Linha } from "@/core/use-cases/derive-linha-conta"
import { getLogoUrl } from "@/core/use-cases/get-logo-url"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"
import { resolveAvatares } from "@/core/use-cases/resolve-avatares"

// Lê o banco a cada request: nada de prerender estático no build (sem DB lá).
export const dynamic = "force-dynamic"

const EYEBROW = (
  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-luc-faint">
    Finanças · Assunto
  </span>
)

/** "pago em dd/mm" quando quitada (fato do Lançamento); frase de urgência (#62) quando em aberto. */
function fraseDoBloco(linha: Linha, dataPagamento: string | null | undefined): string {
  if (linha.farol !== "verde") return linha.frase
  return dataPagamento ? `pago em ${formatarDataBr(dataPagamento).slice(0, 5)}` : "pago · sem data"
}

/** Cockpit do Assunto Pagamentos Recorrentes: a Análise do mês vigente no topo + lista de Contas e cadastro. */
export default async function FinancasPage({
  searchParams,
}: {
  searchParams: Promise<{ nova?: string }>
}) {
  const { nova } = await searchParams
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const bills = await listBills(drizzleBillRepo(), lar.id)
  const ativas = bills.filter((b) => b.estado === "ativa")
  const encerradas = bills.filter((b) => b.estado === "encerrada")

  // A Análise soma o Lar inteiro — uma só leitura de todos os Lançamentos das
  // Contas ativas (sem N+1 por Conta).
  const pagamentos = await listAllPayments(drizzlePaymentRepo(), lar.id)
  const hoje = systemClock().hoje()
  const cenario = derivarCenarioMes(systemClock(), ativas, pagamentos)
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
  const linhas = derivarLinhasContas(systemClock(), nationalBankCalendar(), ativas, pagamentos)
  const pessoasComAvatar = await resolveAvatares(lar.pessoas, store)
  const billsPorId = new Map(ativas.map((bill) => [bill.id, bill]))

  // Panorama (Final): só as ocorrências do mês vigente — o mesmo universo do
  // Cenário. Conta fora de fase segue visível em "Contas ativas" e, se em
  // aberto, no chip de pendências anteriores.
  const blocos: BlocoPanorama[] = linhas
    .filter((linha) => linha.competenciaVigente === cenario.competencia)
    .map((linha) => {
      const bill = billsPorId.get(linha.billId)
      if (!bill) return null
      const vigente = pagamentos.find(
        (p) => p.billId === linha.billId && p.competencia === linha.competenciaVigente,
      )
      return {
        billId: linha.billId,
        nome: bill.nome,
        icon: bill.icon,
        logoUrl: logoUrls.get(bill.id) ?? null,
        farol: linha.farol,
        frase: fraseDoBloco(linha, vigente?.dataPagamento),
        valor: linha.valor,
        registrarHref:
          linha.farol === "verde"
            ? null
            : `/areas/financas/pagamentos-recorrentes/${bill.id}?registrar=1&competencia=${linha.competenciaVigente}`,
      }
    })
    .filter((bloco): bloco is BlocoPanorama => bloco != null)

  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
        <PageHeader
          eyebrow={EYEBROW}
          title="Pagamentos Recorrentes"
          description="Gerenciamento de Contas e pagamentos recorrentes (normalmente mensais) relevantes para o casal."
          actions={
            <Button href="/areas/financas/pagamentos-recorrentes?nova=1" variant="primary">
              Nova Conta
            </Button>
          }
        />

        {ativas.length > 0 && (
          <section aria-labelledby="analise-heading" className="flex flex-col gap-[18px]">
            <SectionHeading
              id="analise-heading"
              title="Análise do mês vigente"
              actions={
                <span className="font-mono text-[11px] text-luc-muted">
                  hoje é {formatarDataBr(hoje)}
                </span>
              }
            />
            <PanoramaContas blocos={blocos} />
            <div className="flex flex-col gap-2.5">
              <CenarioPagamentosMes cenario={cenario} />
              <PendenciasAnterioresChip pendencias={pendenciasAnteriores} />
            </div>
          </section>
        )}

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

        <EncerradasSection bills={encerradas} logoUrls={logoUrls} />
      </div>
      {nova === "1" && <NovaContaModal closeHref="/areas/financas/pagamentos-recorrentes" />}
    </div>
  )
}
