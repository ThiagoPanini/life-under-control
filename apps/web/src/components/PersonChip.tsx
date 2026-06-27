import { coresPessoa, type Pessoa } from "@/core/domain/household"

/** Chip de uma Pessoa do Lar: badge com a inicial (cor derivada do hue) + nome. */
export function PersonChip({ pessoa }: { pessoa: Pessoa }) {
  const { fg, bg } = coresPessoa(pessoa.hue)
  return (
    <span className="inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-luc-lg border border-luc-border bg-luc-surface-2 py-1.5 pr-3.5 pl-1.5">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-[13px] font-semibold"
        style={{ color: fg, backgroundColor: bg }}
      >
        {pessoa.inicial}
      </span>
      <span className="truncate text-sm text-luc-text">{pessoa.nome}</span>
    </span>
  )
}
