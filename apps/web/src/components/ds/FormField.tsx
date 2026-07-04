import type { ReactNode } from "react"
import type { ErroCampo } from "@/core/domain/bill"

export const inputClass =
  "min-h-11 w-full rounded-luc-md border border-luc-border bg-luc-surface-1 px-3 py-2 text-sm text-luc-text outline-none transition-[border-color,box-shadow,color,background-color] duration-150 placeholder:text-luc-faint focus-visible:border-luc-accent focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg aria-[invalid=true]:border-luc-warn disabled:cursor-not-allowed disabled:bg-luc-surface-2 disabled:text-luc-disabled"

export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-luc-warn">
      {children}
    </p>
  )
}

/** Rótulo eyebrow dos formulários compactos (Final): 11px/700, uppercase, tracking .11em. */
export const compactLabelClass = "text-[11px] font-bold uppercase tracking-[0.11em] text-luc-text-3"

/** Caixa de campo dos formulários compactos (Final): 38px, raio 9, borda strong, fundo translúcido. */
export const compactInputClass =
  "min-h-[38px] w-full rounded-[9px] border border-luc-border-strong bg-white/[0.03] px-3 text-[14px] text-luc-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-luc-faint focus-visible:border-luc-accent focus-visible:ring-2 focus-visible:ring-luc-accent aria-[invalid=true]:border-luc-warn"

export function Field({
  label,
  htmlFor,
  error,
  labelClassName,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  /** Sobrescreve o estilo do rótulo (ex.: `compactLabelClass` nos modais compactos). */
  labelClassName?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className={labelClassName ?? "text-[11.5px] font-semibold text-luc-text-3"}
      >
        {label}
      </label>
      {children}
      {error && <FieldError id={`${htmlFor}-error`}>{error}</FieldError>}
    </div>
  )
}

export function getFieldError(errors: ErroCampo[], field: string): string | undefined {
  return errors.find((error) => error.campo === field)?.mensagem
}
