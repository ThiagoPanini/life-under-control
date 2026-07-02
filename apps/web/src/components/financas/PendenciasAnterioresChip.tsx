"use client"

import Link from "next/link"
import { useState } from "react"
import { descreverMesPorExtenso } from "@/core/domain/bill"
import type { PendenciaAnterior } from "@/core/use-cases/derive-forma-competencia"

/**
 * Pendências anteriores como coleção (issue #58): o chip warn no topo da
 * Pista resume ("◂ junho: Internet em aberto"; com 2+, "◂ 2 em aberto de
 * junho") e abre a lista completa — nenhuma pendência se perde num campo
 * singular.
 */

function mesCurto(competencia: string): string {
  return descreverMesPorExtenso(competencia).split(" de ")[0]
}

function resumo(pendencias: PendenciaAnterior[]): string {
  if (pendencias.length === 1) {
    const [p] = pendencias
    return `◂ ${mesCurto(p.competencia)}: ${p.titulo} em aberto`
  }
  const maisRecente = [...pendencias].sort((a, b) => b.competencia.localeCompare(a.competencia))[0]
  return `◂ ${pendencias.length} em aberto de ${mesCurto(maisRecente.competencia)}`
}

export function PendenciasAnterioresChip({ pendencias }: { pendencias: PendenciaAnterior[] }) {
  const [aberta, setAberta] = useState(false)
  if (pendencias.length === 0) return null

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="inline-flex items-center gap-1.5 rounded-luc-sm border border-luc-warn/20 bg-luc-warn/10 px-2 py-0.5 font-semibold text-[11px] text-luc-warn"
      >
        {resumo(pendencias)}
      </button>
      {aberta && (
        <ul className="absolute z-10 mt-1.5 flex w-max min-w-[220px] flex-col gap-1 rounded-luc-lg border border-luc-border bg-luc-surface-3 p-2 shadow-lg">
          {pendencias.map((p) => (
            <li key={`${p.contaId}-${p.competencia}`}>
              <Link
                href={`/areas/financas/pagamentos-recorrentes/${p.contaId}`}
                className="block rounded-luc-sm px-2 py-1 text-[12px] text-luc-text-2 hover:bg-luc-surface-2 hover:text-luc-accent-bright"
              >
                {mesCurto(p.competencia)} · {p.titulo}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
