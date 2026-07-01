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

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[11.5px] font-semibold text-luc-text-3">
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
