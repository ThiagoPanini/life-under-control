import { curveMonotoneX } from "@visx/curve"
import { scaleLinear, scalePoint } from "@visx/scale"
import { AreaClosed, LinePath } from "@visx/shape"

const WIDTH = 560
const HEIGHT = 110
const PAD_X = 8
const PAD_TOP = 12
const PAD_BOTTOM = 12

/**
 * Sparkline (issue #55/#56, reconstrução em visx do que era `TrendCard`): linha
 * ciano com área que desvanece e ponto final em accent-bright. Só recebe
 * `values` já filtrados pelo chamador (ex.: `valoresFechados` — nenhum mês em
 * curso entra aqui, senão a linha mentiria).
 */
export function Sparkline({ values, label = "Tendência" }: { values: number[]; label?: string }) {
  const safeValues = values.length > 0 ? values : [0]
  const min = Math.min(...safeValues)
  const max = Math.max(...safeValues)

  const xScale = scalePoint({
    domain: safeValues.map((_, index) => index),
    range: [PAD_X, WIDTH - PAD_X],
  })
  const yScale = scaleLinear({
    domain: [min, max],
    range: [HEIGHT - PAD_BOTTOM, PAD_TOP],
  })

  const x = (_value: number, index: number) => xScale(index) ?? PAD_X
  const y = (value: number) => yScale(value)
  const lastIndex = safeValues.length - 1

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-[108px] w-full motion-safe:transition-opacity motion-safe:duration-150"
      role="img"
      aria-label={`${label}: ${safeValues.map((v) => v).join(", ")}`}
    >
      <defs>
        <linearGradient id="luc-sparkline-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--luc-accent)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--luc-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <AreaClosed
        data={safeValues}
        x={x}
        y={y}
        yScale={yScale}
        curve={curveMonotoneX}
        fill="url(#luc-sparkline-area)"
      />
      <LinePath
        data={safeValues}
        x={x}
        y={y}
        curve={curveMonotoneX}
        stroke="var(--luc-accent)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.length > 0 && (
        <circle
          cx={x(safeValues[lastIndex], lastIndex)}
          cy={y(safeValues[lastIndex])}
          r={3.2}
          fill="var(--luc-accent-bright)"
        />
      )}
    </svg>
  )
}
