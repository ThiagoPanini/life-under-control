import Link from "next/link"
import { Pill } from "@/components/ds/Pill"
import { BillIcon } from "@/components/financas/BillIcon"
import {
  type Bill,
  descreverRecorrencia,
  descreverVencimento,
  formatarDataBr,
} from "@/core/domain/bill"

/**
 * Card de uma Conta na lista de Finanças. Mostra a *regra* — Recorrência e
 * vencimento esperado — nunca um valor (invariante #5). O card todo é o caminho
 * para o detalhe da Conta (baixa + Lançamentos, #19; daí se chega à edição, #18);
 * farol, grid, média e histórico chegam com o card cheio (#21). Contas encerradas
 * aparecem esmaecidas, com a data de encerramento.
 */
export function BillCard({ bill }: { bill: Bill }) {
  const encerrada = bill.estado === "encerrada"
  return (
    <Link
      href={`/areas/financas/${bill.id}`}
      className={`flex items-start gap-4 rounded-luc-lg border border-luc-border bg-luc-surface-1 p-5 transition-colors hover:border-luc-border-strong focus-visible:border-luc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent/40 ${
        encerrada ? "opacity-60" : ""
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-luc-md border border-luc-border bg-luc-surface-2 text-luc-text-2">
        <BillIcon name={bill.icon} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-luc-text">{bill.nome}</span>
          {encerrada && bill.encerradaEm && (
            <Pill tone="muted">Encerrada · {formatarDataBr(bill.encerradaEm)}</Pill>
          )}
        </div>
        {bill.descricao && (
          <span className="text-luc-text-3 text-sm leading-snug">{bill.descricao}</span>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px] text-luc-text-2">
          <span>{descreverRecorrencia(bill.recurrence)}</span>
          <span className="text-luc-faint">·</span>
          <span>{descreverVencimento(bill.dueRule, bill.dueMonthOffset)}</span>
        </div>
      </div>
    </Link>
  )
}
