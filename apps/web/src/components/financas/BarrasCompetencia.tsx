"use client"

import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { Bar } from "@visx/shape"
import { useState } from "react"
import { mesCurto } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { PontoBarraCompetencia } from "@/core/use-cases/derive-barras-competencia"

const WIDTH = 560
const HEIGHT = 150
const PAD_TOP = 22
const PAD_BOTTOM = 28
const PAD_X = 8

function mesLongo(competencia: string) {
  const ano = competencia.split("-")[0]
  return `${mesCurto(competencia)}/${ano.slice(2)}`
}

function textoBarra(ponto: PontoBarraCompetencia): string {
  const mes = mesLongo(ponto.competencia)
  if (ponto.estado === "lacuna") return `${mes} · sem dado`
  const valor = formatBRL(ponto.valor)
  return ponto.estado === "em-curso" ? `${mes} · ${valor} · em curso` : `${mes} · ${valor}`
}

const DELTA_TONE: Record<"success" | "warn" | "muted", string> = {
  success: "text-luc-success",
  warn: "text-luc-warn",
  muted: "text-luc-muted",
}

const CAP: Record<"neutro" | "success" | "warn", string> = {
  neutro: "border-t-luc-border-strong",
  success: "border-t-luc-success",
  warn: "border-t-luc-warn",
}

/**
 * "Total pago por competência" em barras (issue #55): forma honesta pra unidade
 * discreta, substitui a linha com gradiente/crosshair do `TrendCard`. Mês em
 * curso nasce oco/tracejado (nunca compara — CONTEXT.md "mês em curso × mês
 * fechado"); lacuna vira marcador distinto, nunca uma barra de zero disfarçada
 * (invariante #3). `estado` pinta o cap (borda superior) pra reuso na História
 * de 12 competências (#59); default `"neutro"` serve ao cockpit.
 */
export function BarrasCompetencia({
  titulo,
  pontos,
  mediaMensal,
  deltaTexto,
  deltaTone = "muted",
  estado = "neutro",
}: {
  titulo: string
  pontos: PontoBarraCompetencia[]
  mediaMensal: number | null
  deltaTexto?: string
  deltaTone?: "success" | "warn" | "muted"
  estado?: "neutro" | "success" | "warn"
}) {
  const [ativo, setAtivo] = useState<string | null>(null)

  if (pontos.length === 0) {
    return (
      <section
        className={`rounded-[14px] border border-luc-border border-t-[3px] bg-luc-surface-2 p-4 sm:px-[18px] ${CAP[estado]}`}
      >
        <h2 className="text-[12.5px] font-bold text-luc-text-strong">{titulo}</h2>
        <p className="mt-2 text-xs text-luc-text-3">Sem histórico de competências pagas ainda.</p>
      </section>
    )
  }

  const maxValor = Math.max(1, mediaMensal ?? 0, ...pontos.map((ponto) => ponto.valor))
  const xScale = scaleBand<string>({
    domain: pontos.map((ponto) => ponto.competencia),
    range: [PAD_X, WIDTH - PAD_X],
    padding: 0.35,
  })
  const yScale = scaleLinear<number>({
    domain: [0, maxValor],
    range: [HEIGHT - PAD_BOTTOM, PAD_TOP],
  })

  const barraDoAtivo = pontos.find((ponto) => ponto.competencia === ativo)

  return (
    <section
      className={`rounded-[14px] border border-luc-border border-t-[3px] bg-luc-surface-2 p-4 sm:px-[18px] ${CAP[estado]}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[12.5px] font-bold text-luc-text-strong">{titulo}</h2>
        {deltaTexto && (
          <span className={`text-xs font-semibold ${DELTA_TONE[deltaTone]}`}>{deltaTexto}</span>
        )}
      </div>

      <div className="relative mt-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-[148px] w-full"
          role="img"
          aria-label={titulo}
        >
          {mediaMensal != null && (
            <>
              <line
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={yScale(mediaMensal)}
                y2={yScale(mediaMensal)}
                stroke="var(--luc-text-3)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text
                x={WIDTH - PAD_X}
                y={yScale(mediaMensal) - 4}
                textAnchor="end"
                className="font-mono text-[10px]"
                fill="var(--luc-text-3)"
              >
                média 12m · {formatBRL(mediaMensal)}
              </text>
            </>
          )}

          <Group>
            {pontos.map((ponto) => {
              const bandX = xScale(ponto.competencia) ?? 0
              const bandWidth = xScale.bandwidth()
              const barWidth = bandWidth * 0.62
              const barX = bandX + (bandWidth - barWidth) / 2
              const baseY = yScale(0)
              const compartilhado = {
                "data-testid": "barra-competencia",
                "data-estado": ponto.estado,
                tabIndex: 0,
                role: "graphics-symbol",
                "aria-label": textoBarra(ponto),
                onMouseEnter: () => setAtivo(ponto.competencia),
                onMouseLeave: () =>
                  setAtivo((atual) => (atual === ponto.competencia ? null : atual)),
                onFocus: () => setAtivo(ponto.competencia),
                onBlur: () => setAtivo((atual) => (atual === ponto.competencia ? null : atual)),
                className:
                  "cursor-pointer outline-none motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-75 focus-visible:opacity-75",
              }

              if (ponto.estado === "lacuna") {
                return (
                  <line
                    key={ponto.competencia}
                    {...compartilhado}
                    x1={barX}
                    x2={barX + barWidth}
                    y1={baseY}
                    y2={baseY}
                    stroke="var(--luc-text-3)"
                    strokeWidth={2}
                    strokeDasharray="2 3"
                  />
                )
              }

              const barY = yScale(ponto.valor)
              const barHeight = Math.max(baseY - barY, 2)

              if (ponto.estado === "em-curso") {
                return (
                  <g key={ponto.competencia} {...compartilhado}>
                    <Bar
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      fill="transparent"
                      stroke="var(--luc-accent)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      rx={3}
                    />
                    <text
                      x={barX + barWidth / 2}
                      y={barY - 6}
                      textAnchor="middle"
                      className="text-[9px]"
                      fill="var(--luc-accent)"
                    >
                      (em curso)
                    </text>
                  </g>
                )
              }

              return (
                <Bar
                  key={ponto.competencia}
                  {...compartilhado}
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill="var(--luc-accent)"
                  rx={3}
                />
              )
            })}
          </Group>
        </svg>

        {barraDoAtivo && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 right-2 rounded-md border border-luc-border bg-luc-surface px-2 py-1 font-mono text-[10.5px] text-luc-text"
          >
            {textoBarra(barraDoAtivo)}
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-luc-muted">
        {pontos.map((ponto) => (
          <span key={ponto.competencia}>{mesCurto(ponto.competencia)}</span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th>Competência</th>
            <th>Valor</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {pontos.map((ponto) => (
            <tr key={ponto.competencia}>
              <td>{mesLongo(ponto.competencia)}</td>
              <td>{ponto.estado === "lacuna" ? "sem dado" : formatBRL(ponto.valor)}</td>
              <td>{ponto.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
