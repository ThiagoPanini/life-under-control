import { descreverMesPorExtenso } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { EstimativaMes, QuitadasMes } from "@/core/use-cases/derive-forma-competencia"

/** Bloco Competência (issue #58): mês por extenso, progresso pago/projetado, N/M quitadas. */

function textoProgresso(pago: number, projetado: EstimativaMes): string {
  if (projetado.estado === "sem-historico") {
    return `${formatBRL(pago)} pagos · sem histórico para projetar o mês`
  }
  return `${formatBRL(pago)} pagos de ~${formatBRL(projetado.valor)} projetados · estimativa do histórico`
}

function percentualPago(pago: number, projetado: EstimativaMes): number {
  if (projetado.estado === "sem-historico" || projetado.valor === 0) return 0
  return Math.min(100, Math.round((pago / projetado.valor) * 100))
}

export function BlocoCompetencia({
  competencia,
  emCurso,
  pago,
  projetado,
  quitadas,
}: {
  competencia: string
  emCurso: boolean
  pago: number
  projetado: EstimativaMes
  quitadas: QuitadasMes
}) {
  const percent = percentualPago(pago, projetado)

  return (
    <div className="flex flex-col gap-2.5 rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4">
      <span className="font-mono text-[10px] text-luc-faint uppercase tracking-[0.14em]">
        Competência
      </span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-[15px] text-luc-text capitalize">
          {descreverMesPorExtenso(competencia)}
        </h2>
        <span
          className={`rounded-luc-sm px-2 py-1 font-mono text-[9.5px] ${emCurso ? "bg-luc-accent-12 text-luc-accent-bright" : "bg-white/[0.04] text-luc-muted"}`}
        >
          {emCurso ? "em curso" : "fechada"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-luc-border">
        <div className="h-full rounded-full bg-luc-accent" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-[11px] text-luc-muted">{textoProgresso(pago, projetado)}</p>
      <p className="font-mono text-[12.5px] text-luc-text-2">
        {quitadas.quitadas}/{quitadas.total} quitadas
      </p>
    </div>
  )
}
