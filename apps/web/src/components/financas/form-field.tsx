import type { ReactNode } from "react"
import type { ErroCampo } from "@/core/domain/bill"

/**
 * Plumbing de campo de formulário das telas de Finanças (Mirante) — fonte única
 * compartilhada por `BillForm` (cadastro de Conta) e `PaymentForm` (baixa de
 * Lançamento): o estilo do input, o rótulo+erro e a busca do erro por campo. Sem
 * estado próprio — apresentacional puro; cada formulário traz seus controlados.
 */

/** Estilo único dos inputs/selects dos formulários. */
export const inputCls =
  "min-h-11 w-full rounded-luc-md border border-luc-border bg-luc-surface-2 px-3 py-2 text-luc-text outline-none transition-colors focus-visible:border-luc-accent focus-visible:ring-2 focus-visible:ring-luc-accent/40"

/** A mensagem de erro do campo (role=alert para leitores de tela). */
export function MensagemErro({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-luc-warn text-sm">
      {children}
    </p>
  )
}

/** Rótulo + controle + (opcional) mensagem de erro — o wrapper de um campo. */
export function Campo({
  label,
  htmlFor,
  erro,
  children,
}: {
  label: string
  htmlFor: string
  erro?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-medium text-luc-text-2 text-sm">
        {label}
      </label>
      {children}
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </div>
  )
}

/** A mensagem do erro daquele campo, se houver — a busca que os forms repetiam. */
export function erroDoCampo(erros: ErroCampo[], campo: string): string | undefined {
  return erros.find((e) => e.campo === campo)?.mensagem
}
