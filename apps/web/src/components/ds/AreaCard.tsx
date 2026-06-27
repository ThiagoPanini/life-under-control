import Link from "next/link"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Pill } from "@/components/ds/Pill"
import type { Area } from "@/core/domain/areas"

/** Card de uma Área no Painel. Enquanto a Área não é dado, mostra selo "em breve". */
export function AreaCard({ area }: { area: Area }) {
  const emBreve = area.estado === "em-breve"
  return (
    <Link
      href={`/areas/${area.slug}`}
      data-estado={area.estado}
      className="group flex flex-col gap-5 rounded-luc-lg border border-luc-border bg-luc-surface-1 p-5 transition-colors hover:border-luc-border-strong"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-luc-md border border-luc-border bg-luc-surface-2 text-luc-text-2 transition-colors group-hover:text-luc-accent">
          <AreaIcon name={area.icon} />
        </span>
        {emBreve && <Pill tone="muted">em breve</Pill>}
      </div>
      <span className="font-medium text-luc-text">{area.nome}</span>
    </Link>
  )
}
