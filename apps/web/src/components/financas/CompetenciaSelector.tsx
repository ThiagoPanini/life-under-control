"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

export type OpcaoCompetencia = {
  value: string
  label: string
  emCurso: boolean
}

/** Seletor da lente mensal. O estado vive na URL para voltar/recarregar sem surpresa. */
export function CompetenciaSelector({
  competencia,
  competenciaCorrente,
  opcoes,
}: {
  competencia: string
  competenciaCorrente: string
  opcoes: OpcaoCompetencia[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const indice = opcoes.findIndex((opcao) => opcao.value === competencia)

  function selecionar(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === competenciaCorrente) params.delete("competencia")
    else params.set("competencia", value)
    const query = params.toString()
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    )
  }

  return (
    <div
      className="flex items-center gap-1 rounded-luc-md border border-luc-border bg-luc-surface-2 p-1 transition-colors focus-within:border-luc-accent"
      aria-busy={pending}
    >
      <button
        type="button"
        aria-label="Competência anterior"
        disabled={indice <= 0 || pending}
        onClick={() => selecionar(opcoes[indice - 1]?.value)}
        className="flex h-8 w-8 items-center justify-center rounded-luc-sm text-luc-text-2 transition-colors hover:bg-luc-accent-06 hover:text-luc-accent-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent disabled:cursor-not-allowed disabled:text-luc-disabled disabled:hover:bg-transparent"
      >
        <ChevronLeft aria-hidden size={15} />
      </button>
      <label className="relative">
        <span className="sr-only">Competência do Panorama</span>
        <select
          value={competencia}
          disabled={pending}
          onChange={(event) => selecionar(event.target.value)}
          className="h-8 min-w-[184px] cursor-pointer appearance-none rounded-luc-sm border-0 bg-transparent px-3 pr-8 font-mono text-[11.5px] text-luc-text outline-none disabled:cursor-wait"
        >
          {opcoes.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.label}
              {opcao.emCurso ? " · em curso" : ""}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-r border-b border-luc-muted"
        />
      </label>
      <button
        type="button"
        aria-label="Próxima Competência"
        disabled={indice < 0 || indice >= opcoes.length - 1 || pending}
        onClick={() => selecionar(opcoes[indice + 1]?.value)}
        className="flex h-8 w-8 items-center justify-center rounded-luc-sm text-luc-text-2 transition-colors hover:bg-luc-accent-06 hover:text-luc-accent-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent disabled:cursor-not-allowed disabled:text-luc-disabled disabled:hover:bg-transparent"
      >
        <ChevronRight aria-hidden size={15} />
      </button>
    </div>
  )
}
