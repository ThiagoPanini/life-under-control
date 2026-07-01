import Link from "next/link"
import { Pill, type PillTone } from "@/components/ds/Pill"
import { BillIcon } from "@/components/financas/BillIcon"
import {
  type Bill,
  descreverRecorrencia,
  descreverVencimento,
  formatarDataBr,
} from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { CardConta, FarolEstado, GridEstado } from "@/core/use-cases/derive-bill-card"

const FAROL: Record<FarolEstado, { label: string; tone: PillTone; dot: string; aria: string }> = {
  verde: {
    label: "quitada",
    tone: "success",
    dot: "bg-luc-success",
    aria: "Conta quitada no mês",
  },
  cinza: {
    label: "aguardando",
    tone: "neutral",
    dot: "bg-luc-text-3",
    aria: "Conta aguardando, vencimento distante",
  },
  amarelo: {
    label: "vence em até 3 dias",
    tone: "warn",
    dot: "border-2 border-luc-warn bg-transparent",
    aria: "Conta vence em até 3 dias",
  },
  vermelho: {
    label: "pendente",
    tone: "warn",
    dot: "bg-luc-warn ring-2 ring-luc-warn/25",
    aria: "Conta vence hoje ou está atrasada",
  },
}

const GRID: Record<GridEstado, { label: string; className: string }> = {
  "em-dia": { label: "em dia", className: "bg-luc-success" },
  "atraso-leve": { label: "atraso leve", className: "bg-luc-warn/60" },
  atraso: { label: "atraso", className: "bg-luc-warn ring-1 ring-luc-warn/30" },
  "em-aberto": { label: "em aberto", className: "border-2 border-luc-warn bg-transparent" },
  aguardando: { label: "aguardando", className: "border border-luc-border bg-white/[0.06]" },
  "pago-sem-data": { label: "pago sem data", className: "bg-luc-disabled" },
}

function competenciaAcessivel(competencia: string) {
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`
}

function sparkPath(values: (number | null)[]) {
  const paid = values.filter((value): value is number => value != null)
  if (paid.length === 0) return ""
  const min = Math.min(...paid)
  const max = Math.max(...paid)
  const range = max - min || 1
  return values
    .map((value, index) => {
      if (value == null) return null
      const previous = index > 0 ? values[index - 1] : null
      const x = 3 + (index * 114) / Math.max(values.length - 1, 1)
      const y = 32 - ((value - min) / range) * 25
      return `${previous == null ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .filter(Boolean)
    .join(" ")
}

export function BillCard({ bill, card }: { bill: Bill; card?: CardConta }) {
  const encerrada = bill.estado === "encerrada"
  const farol = card ? FAROL[card.farol] : null

  return (
    <Link
      href={`/areas/financas/pagamentos-recorrentes/${bill.id}`}
      className={`group block rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 transition-[border-color,background-color] hover:border-luc-border-strong hover:bg-luc-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg ${
        encerrada ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-luc-accent-12 text-luc-accent-bright">
          <BillIcon name={bill.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[14.5px] font-bold text-luc-text">{bill.nome}</h3>
            {encerrada && bill.encerradaEm && (
              <Pill tone="muted">encerrada · {formatarDataBr(bill.encerradaEm)}</Pill>
            )}
          </div>
          {bill.descricao && (
            <p className="mt-0.5 truncate text-xs text-luc-text-3">{bill.descricao}</p>
          )}
        </div>
        {farol && (
          <Pill tone={farol.tone} className="shrink-0" role="status" aria-label={farol.aria}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${farol.dot}`} />
            {farol.label}
          </Pill>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-luc-muted">
        <span>{descreverRecorrencia(bill.recurrence)}</span>
        <span aria-hidden>·</span>
        <span>{descreverVencimento(bill.dueRule, bill.dueMonthOffset)}</span>
        {card && (
          <>
            <span aria-hidden>·</span>
            <span className="font-mono text-luc-text-2">
              Vence {formatarDataBr(card.vencimentoVigente)}
            </span>
          </>
        )}
      </div>

      {card && (
        <div className="mt-4 border-luc-row-line border-t pt-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10.5px] font-semibold text-luc-text-3">
                Últimas 12 ocorrências
              </div>
              <div className="mt-2 flex items-center gap-[7px]">
                {card.grid.map((cell) => {
                  const state = GRID[cell.estado]
                  return (
                    <span
                      role="img"
                      key={cell.competencia}
                      data-testid="grid-cell"
                      data-estado={cell.estado}
                      aria-label={`${competenciaAcessivel(cell.competencia)}: ${state.label}`}
                      title={`${competenciaAcessivel(cell.competencia)} · ${state.label}`}
                      className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${state.className}`}
                    />
                  )
                })}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <div className="text-[10.5px] text-luc-muted">Média 12</div>
                <div className="mt-0.5 font-mono text-[12.5px] font-semibold text-luc-text-strong">
                  {card.media == null ? "—" : formatBRL(card.media)}
                </div>
              </div>
              <svg
                viewBox="0 0 120 36"
                className="h-9 w-[88px]"
                role="img"
                aria-label="Histórico de valores pagos"
              >
                <path
                  d={sparkPath(card.sparkline)}
                  fill="none"
                  stroke="var(--luc-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      )}
    </Link>
  )
}
