import Link from "next/link"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Pill } from "@/components/ds/Pill"
import type { Area } from "@/core/domain/areas"

/** Card de uma Área no Painel. Área inativa mostra resumo honesto, nunca uma métrica falsa. */
export function AreaCard({
  area,
  metric,
  summary,
}: {
  area: Area
  metric?: string
  summary?: string
}) {
  const emBreve = area.estado === "em-breve"
  const supportingText = emBreve ? summary : metric
  return (
    <Link
      href={`/areas/${area.slug}`}
      data-estado={area.estado}
      className={`group flex min-h-[74px] touch-manipulation items-center gap-3 rounded-[14px] border p-4 transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg ${
        emBreve
          ? "border-luc-border bg-luc-surface-2 hover:border-luc-border-strong"
          : "border-luc-accent/25 bg-luc-accent-06 hover:border-luc-accent/40"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] transition-colors ${
          emBreve
            ? "bg-white/[0.04] text-luc-text-3 group-hover:text-luc-text-2"
            : "bg-luc-accent-12 text-luc-accent-bright"
        }`}
      >
        <AreaIcon name={area.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold text-luc-text">{area.nome}</div>
        {supportingText && (
          <div className="mt-0.5 truncate text-xs text-luc-text-3">{supportingText}</div>
        )}
      </div>
      <Pill tone={emBreve ? "coming-soon" : "success"}>{emBreve ? "em breve" : "ativa"}</Pill>
    </Link>
  )
}
