import { Receipt, TrendingDown, TrendingUp } from "lucide-react"
import { mesAno } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type {
  DestaquesMes as Destaques,
  MaiorLancamento,
  VariacaoConta,
} from "@/core/use-cases/derive-destaques-mes"

/**
 * Os três destaques do último mês fechado (issue #101): maior alta e maior queda
 * por Conta e o maior Lançamento individual — a "Variações" da Análise Histórica,
 * como o protótipo Final. Consome os destaques prontos do use-case; nada de domínio
 * é recalculado aqui (ADR-0010). Direção dita por palavra ("Maior alta/queda") e
 * pelo sinal do percentual, nunca só pela cor (acessibilidade). Cada métrica sem
 * candidato mostra "Histórico insuficiente" — jamais um zero disfarçado.
 */

/** Percentual com sinal explícito (forma, não só cor): "+42,0%" / "−18,5%" (menos unicode). */
function formatPct(p: number): string {
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1).replace(".", ",")}%`
}

const CAIXA_ICONE = "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white/5"
const ROTULO = "text-[9.5px] font-bold uppercase tracking-[0.1em] text-luc-text-3"
const VALOR_MONO = "font-mono text-[15px] font-semibold"

export function DestaquesMes({ destaques }: { destaques: Destaques }) {
  const {
    competenciaCorrente,
    competenciaBase,
    competenciaFechada,
    maiorAlta,
    maiorQueda,
    maiorLancamento,
  } = destaques
  const periodo = `${mesAno(competenciaFechada)} vs ${mesAno(competenciaBase)}`
  const corrente = mesAno(competenciaCorrente)
  const algumDestaque =
    maiorAlta.estado === "ok" || maiorQueda.estado === "ok" || maiorLancamento.estado === "ok"

  return (
    <div className="flex flex-col gap-3 rounded-[13px] border border-luc-border bg-luc-surface-2 px-4 py-[15px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-luc-text-3">
          Variações · {periodo}
        </span>
        <span className="text-[10.5px] text-luc-faint">
          {corrente} em curso — leitura do último mês fechado
        </span>
      </div>

      {algumDestaque ? (
        <>
          <LinhaVariacao tipo="alta" variacao={maiorAlta} />
          <LinhaVariacao tipo="queda" variacao={maiorQueda} comBorda />
          <LinhaMaiorLancamento maior={maiorLancamento} comBorda />
        </>
      ) : (
        <p className="text-xs text-luc-text-3">
          Sem Lançamentos suficientes nos dois últimos meses fechados para comparar.
        </p>
      )}
    </div>
  )
}

/** Uma linha de variação (alta ou queda). `comBorda` separa da linha de cima. */
function LinhaVariacao({
  tipo,
  variacao,
  comBorda,
}: {
  tipo: "alta" | "queda"
  variacao: VariacaoConta
  comBorda?: boolean
}) {
  const alta = tipo === "alta"
  const Icone = alta ? TrendingUp : TrendingDown
  const cor = alta ? "text-luc-warn" : "text-luc-success"
  const rotulo = alta ? "Maior alta" : "Maior queda"
  const borda = comBorda ? "border-t border-luc-row-line pt-3" : ""

  if (variacao.estado !== "ok") {
    return (
      <div className={`flex items-center gap-2.5 ${borda}`}>
        <span aria-hidden className={`${CAIXA_ICONE} text-luc-text-3`}>
          <Icone size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className={ROTULO}>{rotulo}</div>
          <div className="text-xs text-luc-text-3">Histórico insuficiente</div>
        </div>
      </div>
    )
  }

  const descricao = `${rotulo}: ${variacao.nome}, de ${formatBRL(variacao.base)} para ${formatBRL(
    variacao.atual,
  )}, ${formatPct(variacao.percentual)}`

  return (
    <div className={`flex items-center gap-2.5 ${borda}`}>
      <span aria-hidden className={`${CAIXA_ICONE} ${cor}`}>
        <Icone size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div aria-hidden className={ROTULO}>
          {rotulo}
        </div>
        <div aria-hidden className="truncate text-[12.5px] font-semibold text-luc-text">
          {variacao.nome}{" "}
          <span className="font-mono text-[10.5px] font-normal text-luc-muted">
            {formatBRL(variacao.base)} → {formatBRL(variacao.atual)}
          </span>
        </div>
      </div>
      <span aria-hidden className={`${VALOR_MONO} ${cor}`}>
        {formatPct(variacao.percentual)}
      </span>
      <span className="sr-only">{descricao}</span>
    </div>
  )
}

/** A linha do maior Lançamento individual do mês fechado. */
function LinhaMaiorLancamento({ maior, comBorda }: { maior: MaiorLancamento; comBorda?: boolean }) {
  const borda = comBorda ? "border-t border-luc-row-line pt-3" : ""

  if (maior.estado !== "ok") {
    return (
      <div className={`flex items-center gap-2.5 ${borda}`}>
        <span aria-hidden className={`${CAIXA_ICONE} text-luc-text-3`}>
          <Receipt size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className={ROTULO}>Maior Lançamento</div>
          <div className="text-xs text-luc-text-3">Histórico insuficiente</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2.5 ${borda}`}>
      <span aria-hidden className={`${CAIXA_ICONE} text-luc-text-2`}>
        <Receipt size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div aria-hidden className={ROTULO}>
          Maior Lançamento
        </div>
        <div aria-hidden className="truncate text-[12.5px] font-semibold text-luc-text">
          {maior.nome}
        </div>
      </div>
      <span aria-hidden className={`${VALOR_MONO} text-luc-text`}>
        {formatBRL(maior.valor)}
      </span>
      <span className="sr-only">
        Maior Lançamento: {maior.nome}, {formatBRL(maior.valor)}
      </span>
    </div>
  )
}
