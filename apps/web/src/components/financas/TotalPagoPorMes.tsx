"use client"

import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { Bar } from "@visx/shape"
import { BarChart3 } from "lucide-react"
import { useState } from "react"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { mesAno, mesCurto } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { PontoTotalPagoMes, SerieHistorica } from "@/core/use-cases/derive-analise-historica"

const WIDTH = 560
const HEIGHT = 150
const PAD_TOP = 22
const PAD_BOTTOM = 28
const PAD_X = 8

/** Um ponto sem cifra a exibir: mês fechado sem fato, ou mês corrente ainda sem Lançamento. */
function semValor(ponto: PontoTotalPagoMes): boolean {
  return ponto.estado === "sem-dado" || (ponto.estado === "em-curso" && ponto.valor === 0)
}

/** Rótulo textual de uma barra — traço + palavra, nunca só cor (mês parcial e ausência ditos por extenso). */
function textoBarra(ponto: PontoTotalPagoMes): string {
  const mes = mesAno(ponto.competencia)
  if (ponto.estado === "sem-dado") return `${mes} · sem dado`
  if (ponto.estado === "em-curso" && ponto.valor === 0) {
    return `${mes} · sem lançamento ainda · em curso`
  }
  const valor = formatBRL(ponto.valor)
  return ponto.estado === "em-curso" ? `${mes} · ${valor} · em curso` : `${mes} · ${valor}`
}

const ICONE = (
  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
    <BarChart3 aria-hidden size={15} />
  </span>
)

/**
 * Análise Histórica (issue #98): a série do Total Pago por Mês nas doze
 * Competências até a atual. Meses fechados são barras sólidas; o mês corrente é
 * parcial — barra oca tracejada + rótulo "(em curso)", nunca comparado
 * (CONTEXT.md "mês em curso × mês fechado"). Mês sem fato vira um traço de base,
 * não uma barra de zero disfarçada (invariante #3). A seção nunca some: sem
 * fatos na janela, mostra a limitação por extenso. Consome a série pronta do
 * use-case — nada de domínio é recalculado aqui (ADR-0010).
 */
export function TotalPagoPorMes({ serie }: { serie: SerieHistorica }) {
  return (
    <section aria-labelledby="historico-heading" className="flex flex-col gap-[18px]">
      <SectionHeading
        id="historico-heading"
        title="Análise Histórica"
        variant="destaque"
        icon={ICONE}
      />
      {serie.estado === "sem-fatos" ? (
        <div className="rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 sm:px-[18px]">
          <p className="text-xs text-luc-text-3">Sem Lançamentos na janela de 12 meses ainda.</p>
        </div>
      ) : (
        <GraficoTotalPago pontos={serie.pontos} />
      )}
    </section>
  )
}

/** O card do gráfico Visx + a tabela `sr-only` equivalente. Isola o estado de foco/hover. */
function GraficoTotalPago({ pontos }: { pontos: PontoTotalPagoMes[] }) {
  // Foco e hover à parte (como em `HistoriaConta`): passar o mouse por OUTRA
  // barra não pode apagar o tooltip de quem está com foco de teclado.
  const [focado, setFocado] = useState<string | null>(null)
  const [emHover, setEmHover] = useState<string | null>(null)
  const ativo = focado ?? emHover

  // Escala só pelos meses fechados: o mês em curso é parcial e nunca dita a
  // comparação (CONTEXT.md "mês em curso × mês fechado"). Com `clamp`, um total
  // parcial grande satura no topo em vez de achatar as barras fechadas.
  const valoresFechados = pontos
    .filter((ponto) => ponto.estado === "fechado")
    .map((ponto) => ponto.valor)
  const maxValor = Math.max(1, ...valoresFechados)
  const xScale = scaleBand<string>({
    domain: pontos.map((ponto) => ponto.competencia),
    range: [PAD_X, WIDTH - PAD_X],
    padding: 0.35,
  })
  const yScale = scaleLinear<number>({
    domain: [0, maxValor],
    range: [HEIGHT - PAD_BOTTOM, PAD_TOP],
    clamp: true,
  })

  const barraDoAtivo = pontos.find((ponto) => ponto.competencia === ativo)

  return (
    <div className="rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 sm:px-[18px]">
      <div className="relative mt-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-[148px] w-full"
          aria-label="Total Pago por Mês"
        >
          <Group>
            {pontos.map((ponto) => {
              const bandX = xScale(ponto.competencia) ?? 0
              const bandWidth = xScale.bandwidth()
              const barWidth = bandWidth * 0.62
              const barX = bandX + (bandWidth - barWidth) / 2
              const baseY = yScale(0)
              const compartilhado = {
                "data-testid": "total-pago-barra",
                "data-estado": ponto.estado,
                tabIndex: 0,
                role: "graphics-symbol",
                "aria-label": textoBarra(ponto),
                onMouseEnter: () => setEmHover(ponto.competencia),
                onMouseLeave: () =>
                  setEmHover((atual) => (atual === ponto.competencia ? null : atual)),
                onFocus: () => setFocado(ponto.competencia),
                onBlur: () => setFocado((atual) => (atual === ponto.competencia ? null : atual)),
                className:
                  "cursor-pointer outline-none motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-75 focus-visible:opacity-75",
              }

              if (ponto.estado === "sem-dado") {
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

              if (ponto.estado === "em-curso" && ponto.valor === 0) {
                // Mês corrente ainda sem Lançamento: traço de base accent, nunca
                // uma barra de zero disfarçada (invariante #3).
                return (
                  <g key={ponto.competencia} {...compartilhado}>
                    <line
                      x1={barX}
                      x2={barX + barWidth}
                      y1={baseY}
                      y2={baseY}
                      stroke="var(--luc-accent)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                    <text
                      x={barX + barWidth / 2}
                      y={baseY - 8}
                      textAnchor="middle"
                      className="text-[9px]"
                      fill="var(--luc-accent)"
                    >
                      (em curso)
                    </text>
                  </g>
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
        <caption>Total Pago por Mês</caption>
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
              <td>{mesAno(ponto.competencia)}</td>
              <td>{semValor(ponto) ? "sem dado" : formatBRL(ponto.valor)}</td>
              <td>{ponto.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
