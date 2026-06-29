import { BillIcon } from "@/components/financas/BillIcon"
import { type Bill, descreverRecorrencia, descreverVencimento } from "@/core/domain/bill"

/**
 * Card de uma Conta na lista de Finanças. Mostra a *regra* — Recorrência e
 * vencimento esperado — nunca um valor (invariante #5). Farol, grid, média e
 * histórico chegam com o card cheio (#21).
 */
export function BillCard({ bill }: { bill: Bill }) {
  return (
    <div className="flex items-start gap-4 rounded-luc-lg border border-luc-border bg-luc-surface-1 p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-luc-md border border-luc-border bg-luc-surface-2 text-luc-text-2">
        <BillIcon name={bill.icon} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium text-luc-text">{bill.nome}</span>
        {bill.descricao && (
          <span className="text-luc-text-3 text-sm leading-snug">{bill.descricao}</span>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px] text-luc-text-2">
          <span>{descreverRecorrencia(bill.recurrence)}</span>
          <span className="text-luc-faint">·</span>
          <span>{descreverVencimento(bill.dueRule, bill.dueMonthOffset)}</span>
        </div>
      </div>
    </div>
  )
}
