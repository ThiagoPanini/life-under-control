"use client"

import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { useState } from "react"
import { mesAno, mesCurto } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { GridCelula, GridEstado } from "@/core/use-cases/derive-bill-card"
import { GRID } from "./BillCard"

const WIDTH = 640
const HEIGHT = 172
const PAD_TOP = 22
const PAD_BOTTOM = 28
const PAD_X = 8
const CAP_H = 4
const STUB_H = 2

const CAP_COLOR: Record<GridEstado, string> = {
  "em-dia": "var(--luc-success)",
  "atraso-leve": "var(--luc-warn)",
  atraso: "var(--luc-warn)",
  "em-aberto": "var(--luc-warn)",
  aguardando: "var(--luc-border-strong)",
  "pago-sem-data": "var(--luc-disabled)",
}

const CAP_OPACITY: Partial<Record<GridEstado, number>> = {
  "atraso-leve": 0.6,
}

function rotuloAcessivel(celula: GridCelula): string {
  const valorTexto = celula.valor == null ? "sem Lançamento" : formatBRL(celula.valor)
  return `${mesAno(celula.competencia)} · ${valorTexto} · ${GRID[celula.estado].label}`
}

/**
 * "História · 12 competências" (issue #59): uma barra por ocorrência do grid
 * de `derivarCardConta` — altura = valor pago, cap colorido = um dos seis
 * `GridEstado`. `em-aberto` (venceu sem Lançamento) e `aguardando` (ainda não
 * venceu) não têm valor — viram um stub de 2px, nunca uma barra de zero
 * disfarçada (invariante #3 do CONTEXT.md). Consome o grid pronto; nada é
 * recalculado aqui.
 */
export function HistoriaConta({ grid }: { grid: GridCelula[] }) {
  // Foco e hover são rastreados à parte: passar o mouse por OUTRA barra não
  // pode apagar o tooltip de quem está com foco de teclado (o foco só sai no
  // próprio blur da barra focada).
  const [focado, setFocado] = useState<string | null>(null)
  const [emHover, setEmHover] = useState<string | null>(null)
  const ativo = focado ?? emHover

  if (grid.length === 0) {
    return (
      <section className="rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 sm:px-[18px]">
        <p className="text-xs text-luc-text-3">Sem histórico de competências ainda.</p>
      </section>
    )
  }

  const valores = grid.map((celula) => celula.valor).filter((v): v is number => v != null)
  const maxValor = Math.max(1, ...valores)
  const barraMaxH = HEIGHT - PAD_TOP - PAD_BOTTOM

  const xScale = scaleBand<string>({
    domain: grid.map((celula) => celula.competencia),
    range: [PAD_X, WIDTH - PAD_X],
    padding: 0.35,
  })
  const yScale = scaleLinear<number>({
    domain: [0, maxValor],
    range: [0, barraMaxH],
  })

  const celulaAtiva = grid.find((celula) => celula.competencia === ativo)

  return (
    <section className="rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 sm:px-[18px]">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-[172px] w-full"
          role="img"
          aria-label="História · 12 competências"
        >
          <Group>
            {grid.map((celula) => {
              const bandX = xScale(celula.competencia) ?? 0
              const bandWidth = xScale.bandwidth()
              const barWidth = bandWidth * 0.62
              const barX = bandX + (bandWidth - barWidth) / 2
              const baseY = HEIGHT - PAD_BOTTOM
              const capColor = CAP_COLOR[celula.estado]
              const capOpacity = CAP_OPACITY[celula.estado] ?? 1

              const compartilhado = {
                "data-testid": "historia-conta-barra",
                "data-estado": celula.estado,
                tabIndex: 0,
                role: "graphics-symbol",
                "aria-label": rotuloAcessivel(celula),
                onMouseEnter: () => setEmHover(celula.competencia),
                onMouseLeave: () =>
                  setEmHover((atual) => (atual === celula.competencia ? null : atual)),
                onFocus: () => setFocado(celula.competencia),
                onBlur: () => setFocado((atual) => (atual === celula.competencia ? null : atual)),
                className:
                  "cursor-pointer outline-none motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-75 focus-visible:opacity-75",
              }

              if (celula.valor == null) {
                const stubY = baseY - STUB_H
                if (celula.estado === "em-aberto") {
                  return (
                    <rect
                      key={celula.competencia}
                      {...compartilhado}
                      x={barX}
                      y={stubY}
                      width={barWidth}
                      height={STUB_H}
                      fill="transparent"
                      stroke={capColor}
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                  )
                }
                return (
                  <rect
                    key={celula.competencia}
                    {...compartilhado}
                    x={barX}
                    y={stubY}
                    width={barWidth}
                    height={STUB_H}
                    fill={capColor}
                    rx={1}
                  />
                )
              }

              const barHeight = Math.max(yScale(celula.valor), CAP_H + 4)
              const barY = baseY - barHeight
              const corpoHeight = Math.max(barHeight - CAP_H, 0)

              return (
                <g key={celula.competencia} {...compartilhado}>
                  <rect
                    x={barX}
                    y={barY + CAP_H}
                    width={barWidth}
                    height={corpoHeight}
                    fill="var(--luc-border-strong)"
                  />
                  <rect
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={CAP_H}
                    fill={capColor}
                    fillOpacity={capOpacity}
                    rx={1.5}
                  />
                </g>
              )
            })}
          </Group>
        </svg>

        {celulaAtiva && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 right-2 rounded-md border border-luc-border bg-luc-surface px-2 py-1 font-mono text-[10.5px] text-luc-text"
          >
            {rotuloAcessivel(celulaAtiva)}
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-luc-muted">
        {grid.map((celula) => (
          <span key={celula.competencia}>{mesCurto(celula.competencia)}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-luc-row-line border-t pt-3">
        {(Object.keys(GRID) as GridEstado[]).map((estado) => (
          <span key={estado} className="flex items-center gap-1.5 text-[10.5px] text-luc-text-3">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{
                backgroundColor: estado === "em-aberto" ? "transparent" : CAP_COLOR[estado],
                opacity: CAP_OPACITY[estado] ?? 1,
                border: estado === "em-aberto" ? `1.5px dashed ${CAP_COLOR[estado]}` : undefined,
              }}
            />
            {GRID[estado].label}
          </span>
        ))}
      </div>
    </section>
  )
}
