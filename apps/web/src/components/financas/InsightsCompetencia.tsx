import { ArrowDownRight, ArrowUpRight, CircleDashed, ReceiptText } from "lucide-react"
import Link from "next/link"
import { Pill } from "@/components/ds/Pill"
import { mesAno } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type {
  InsightsCompetencia as InsightsCompetenciaModel,
  VariacaoConta,
} from "@/core/use-cases/derive-insights-competencia"

const ROTA = "/areas/financas/pagamentos-recorrentes"

function Variacao({ variacao, tipo }: { variacao: VariacaoConta | null; tipo: "alta" | "queda" }) {
  const alta = tipo === "alta"
  const Icon = alta ? ArrowUpRight : ArrowDownRight
  if (!variacao) {
    return (
      <div className="rounded-luc-md border border-luc-row-line bg-luc-surface-1 p-3">
        <span className="text-[10.5px] text-luc-muted">
          Nenhuma {alta ? "alta" : "queda"} com base
        </span>
      </div>
    )
  }
  return (
    <Link
      href={`${ROTA}/${variacao.contaId}`}
      className="group rounded-luc-md border border-luc-row-line bg-luc-surface-1 p-3 transition-colors hover:border-luc-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
    >
      <span
        className={`flex items-center gap-1 text-[10.5px] font-semibold ${alta ? "text-luc-warn" : "text-luc-success"}`}
      >
        <Icon aria-hidden size={13} />
        {alta ? "Maior alta" : "Maior queda"}
      </span>
      <strong className="mt-1 block truncate text-[13px] text-luc-text">{variacao.titulo}</strong>
      <span
        className={`mt-1 block font-mono text-lg font-semibold ${alta ? "text-luc-warn" : "text-luc-success"}`}
      >
        {variacao.deltaPercentual > 0 ? "+" : ""}
        {variacao.deltaPercentual.toLocaleString("pt-BR")}%
      </span>
      <span className="mt-0.5 block font-mono text-[10.5px] text-luc-muted">
        {formatBRL(variacao.valorAnterior)} → {formatBRL(variacao.valorAtual)}
      </span>
    </Link>
  )
}

/** Leituras por Conta prontas no núcleo; este componente apenas lhes dá hierarquia. */
export function InsightsCompetencia({ insights }: { insights: InsightsCompetenciaModel }) {
  const comparacao = insights.comparacao
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,.8fr)_minmax(0,.8fr)]">
      <section className="rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-luc-faint">
              Variação por Conta
            </span>
            <p className="mt-1 text-[11px] text-luc-muted">
              {comparacao.estado === "calculada"
                ? `${mesAno(comparacao.competenciaAnterior)} → competência selecionada`
                : "somente entre Competências fechadas"}
            </p>
          </div>
          <Pill tone={insights.estadoCompetencia === "em-curso" ? "accent" : "neutral"}>
            {insights.estadoCompetencia === "em-curso" ? "em curso" : "fechada"}
          </Pill>
        </div>

        {comparacao.estado === "calculada" ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Variacao variacao={comparacao.maiorAlta} tipo="alta" />
            <Variacao variacao={comparacao.maiorQueda} tipo="queda" />
          </div>
        ) : (
          <div className="mt-3 rounded-luc-md border border-luc-border border-dashed bg-luc-surface-1 px-4 py-5">
            <p className="text-[12.5px] font-semibold text-luc-text-2">
              {comparacao.estado === "em-curso"
                ? "A comparação nasce quando esta Competência fechar."
                : "Ainda não há duas Competências com Lançamentos comparáveis."}
            </p>
            <p className="mt-1 text-[10.5px] text-luc-muted">Lacunas nunca viram zero ou −100%.</p>
          </div>
        )}

        {insights.concentracaoTresMaiores != null && (
          <p className="mt-3 border-luc-row-line border-t pt-3 text-[10.5px] text-luc-muted">
            As três maiores Contas concentram{" "}
            <span className="font-mono text-luc-text-2">
              {insights.concentracaoTresMaiores.toLocaleString("pt-BR")}%
            </span>{" "}
            do total desta Competência.
          </p>
        )}
      </section>

      <section className="flex min-h-[164px] flex-col rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4">
        <ReceiptText aria-hidden size={17} className="text-luc-accent" />
        <span className="mt-4 text-[11px] font-semibold text-luc-text-3">Maior Lançamento</span>
        {insights.maiorLancamento ? (
          <>
            <strong className="mt-1 font-mono text-xl text-luc-text">
              {formatBRL(insights.maiorLancamento.valor)}
            </strong>
            <Link
              href={`${ROTA}/${insights.maiorLancamento.contaId}`}
              className="mt-auto truncate pt-3 text-[11px] text-luc-accent hover:underline"
            >
              {insights.maiorLancamento.titulo}
            </Link>
          </>
        ) : (
          <p className="mt-2 text-[11.5px] text-luc-muted">Nenhum Lançamento nesta Competência.</p>
        )}
      </section>

      <section className="flex min-h-[164px] flex-col rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4">
        <CircleDashed
          aria-hidden
          size={17}
          className={insights.semLancamento.quantidade > 0 ? "text-luc-warn" : "text-luc-success"}
        />
        <span className="mt-4 text-[11px] font-semibold text-luc-text-3">Sem Lançamento</span>
        <strong className="mt-1 font-mono text-xl text-luc-text">
          {insights.semLancamento.quantidade}
        </strong>
        <p className="mt-auto line-clamp-2 pt-3 text-[10.5px] text-luc-muted">
          {insights.semLancamento.quantidade === 0
            ? "Todas as ocorrências têm Lançamento."
            : insights.semLancamento.contas.map((conta) => conta.titulo).join(" · ")}
        </p>
      </section>
    </div>
  )
}
