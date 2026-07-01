import type { CSSProperties } from "react"
import type { Pessoa } from "@/core/domain/household"

type PersonKey = "thiago" | "jakeline"

function personKey(pessoa: Pessoa): PersonKey {
  return pessoa.nome.toLocaleLowerCase("pt-BR") === "jakeline" ? "jakeline" : "thiago"
}

/** Autoria por Pessoa. As cores são nominais e nunca representam permissão. */
export function PersonChip({
  pessoa,
  compact = false,
  showName = !compact,
  className = "",
}: {
  pessoa: Pessoa
  compact?: boolean
  showName?: boolean
  className?: string
}) {
  const key = personKey(pessoa)
  const colors = {
    color: `var(--luc-${key}-fg)`,
    backgroundColor: `var(--luc-${key}-bg)`,
  } satisfies CSSProperties

  if (compact && !showName) {
    return (
      <span
        role="img"
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[10px] font-bold ${className}`}
        style={colors}
        aria-label={pessoa.nome}
        title={pessoa.nome}
      >
        <span aria-hidden>{pessoa.inicial}</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-luc-lg border border-luc-border bg-luc-surface-2 py-1.5 pr-3.5 pl-1.5 ${className}`}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-luc-sm text-[11px] font-bold"
        style={colors}
      >
        {pessoa.inicial}
      </span>
      {showName && <span className="truncate text-sm text-luc-text">{pessoa.nome}</span>}
    </span>
  )
}
