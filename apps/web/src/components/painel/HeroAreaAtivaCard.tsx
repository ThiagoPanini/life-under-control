import Link from "next/link"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Pill } from "@/components/ds/Pill"
import type { Area } from "@/core/domain/areas"
import { MESES } from "@/core/domain/bill"
import type { HeroAreaAtiva } from "@/core/use-cases/derive-atencao"
import type { EstadoMarcador } from "@/core/use-cases/derive-forma-competencia"

/**
 * Hero-card da Área ativa no Painel (issue #47) — manchete, não métrica: "N/M
 * quitadas" + próxima Conta. A mini-pista é só-leitura (marcadores com `title`,
 * sem clique) — a Pista interativa vive no cockpit (#58).
 */

const ESTADO_MARCADOR_DOT: Record<EstadoMarcador, string> = {
  quitada: "bg-luc-success",
  "a-vencer": "border-2 border-luc-warn bg-transparent",
  aguardando: "border border-luc-border bg-white/[0.06]",
}

const ESTADO_MARCADOR_LABEL: Record<EstadoMarcador, string> = {
  quitada: "quitada",
  "a-vencer": "a vencer",
  aguardando: "aguardando",
}

function mesPorExtenso(competencia: string): string {
  return MESES[Number(competencia.slice(5, 7)) - 1]
}

export function HeroAreaAtivaCard({
  area,
  assuntoNome,
  contasAtivas,
  emBreveResumo,
  hero,
  href,
}: {
  area: Area
  assuntoNome: string
  contasAtivas: number
  emBreveResumo: string
  hero: HeroAreaAtiva
  href: string
}) {
  const contaLabel = contasAtivas === 1 ? "Conta ativa" : "Contas ativas"

  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-[16px] border border-luc-accent/25 bg-luc-accent-06 p-5 transition-colors hover:border-luc-accent/40"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-luc-accent-12 text-luc-accent-bright">
          <AreaIcon name={area.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-bold text-luc-text">{area.nome}</span>
            <Pill tone="success">ativa</Pill>
          </div>
          <div className="mt-0.5 truncate text-xs text-luc-text-3">
            {assuntoNome} · {contasAtivas} {contaLabel} · {emBreveResumo}
          </div>
        </div>
        <span className="shrink-0 text-[12.5px] font-semibold text-luc-accent">
          Abrir cockpit →
        </span>
      </div>

      <div className="flex flex-col gap-2 border-t border-luc-border pt-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13.5px] font-bold text-luc-text">
            {hero.quitadas.quitadas}/{hero.quitadas.total} quitadas em{" "}
            {mesPorExtenso(hero.competencia)}
          </span>
          <span className="text-xs text-luc-text-3">
            {hero.proxima
              ? `próxima: ${hero.proxima.titulo} ${hero.proxima.frase}`
              : "tudo pago no mês"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {hero.pista.map((marcador) => (
            <span
              key={marcador.contaId}
              title={`${marcador.titulo} — ${ESTADO_MARCADOR_LABEL[marcador.estado]}`}
              className={`h-2 w-2 rounded-full ${ESTADO_MARCADOR_DOT[marcador.estado]}`}
            />
          ))}
        </div>
      </div>
    </Link>
  )
}
