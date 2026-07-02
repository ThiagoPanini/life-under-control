import type { CSSProperties } from "react"
import type { Pessoa } from "@/core/domain/household"
import { PersonAvatar } from "./PersonAvatar"

export type PersonKey = "thiago" | "jakeline"

/**
 * Chave de cor por Pessoa (o Lar tem exatamente 2 — invariante #2); qualquer
 * 3ª cai em "thiago". Pede só `nome` (não `Pessoa` inteira) pra servir também
 * `ShellPessoa`, a forma mais enxuta que a casca usa (`AppShell.tsx`).
 */
export function personKey({ nome }: { nome: string }): PersonKey {
  return nome.toLocaleLowerCase("pt-BR") === "jakeline" ? "jakeline" : "thiago"
}

/**
 * Autoria por Pessoa. As cores são nominais e nunca representam permissão.
 * Mostra a foto (via `PersonAvatar`) quando `pessoa.avatarUrl` vier resolvida
 * (#51); sem ela, cai no fallback inicial+cor — mesma geometria quadrado-
 * arredondada dos dois estados.
 */
export function PersonChip({
  pessoa,
  compact = false,
  showName = !compact,
  className = "",
}: {
  pessoa: Pessoa & { avatarUrl?: string | null }
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
      <PersonAvatar
        avatarUrl={pessoa.avatarUrl}
        inicial={pessoa.inicial}
        nome={pessoa.nome}
        size={20}
        colors={colors}
        className={`rounded-luc-sm ${className}`}
      />
    )
  }

  return (
    <span
      className={`inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-luc-lg border border-luc-border bg-luc-surface-2 py-1.5 pr-3.5 pl-1.5 ${className}`}
    >
      <PersonAvatar
        avatarUrl={pessoa.avatarUrl}
        inicial={pessoa.inicial}
        nome={pessoa.nome}
        size={28}
        colors={colors}
        className="rounded-luc-sm"
        decorative={showName}
      />
      {showName && <span className="truncate text-sm text-luc-text">{pessoa.nome}</span>}
    </span>
  )
}
