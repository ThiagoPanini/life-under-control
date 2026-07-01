import type { ReactNode } from "react"

function geometry(values: number[]) {
  const width = 560
  const height = 110
  const pad = 8
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const x = (index: number) => pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1)
  const y = (value: number) => height - 12 - ((value - min) / range) * (height - 30)
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ")
  const area = `M ${x(0)},${height} L ${values
    .map((value, index) => `${x(index)},${y(value)}`)
    .join(" L ")} L ${x(values.length - 1)},${height} Z`
  return { points, area }
}

export function TrendCard({
  label,
  period,
  value,
  delta,
  deltaTone = "warn",
  values,
  labels,
  className = "",
}: {
  label: string
  period: string
  value: ReactNode
  delta?: ReactNode
  deltaTone?: "success" | "warn" | "muted"
  values: number[]
  labels: string[]
  className?: string
}) {
  const safeValues = values.length > 0 ? values : [0]
  const { points, area } = geometry(safeValues)
  const deltaTones = {
    success: "text-luc-success",
    warn: "text-luc-warn",
    muted: "text-luc-muted",
  }

  return (
    <section
      className={`rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 sm:px-[18px] ${className}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[12.5px] font-bold text-luc-text-strong">{label}</h2>
        <span className="text-[11px] text-luc-muted">{period}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2.5">
        <strong className="font-mono text-[23px] font-semibold tracking-[-0.02em] text-luc-text">
          {value}
        </strong>
        {delta && <span className={`text-xs font-semibold ${deltaTones[deltaTone]}`}>{delta}</span>}
      </div>
      <svg
        viewBox="0 0 560 110"
        preserveAspectRatio="none"
        className="mt-1 block h-[108px] w-full"
        role="img"
        aria-label={`Tendência de ${label.toLocaleLowerCase("pt-BR")}`}
      >
        <defs>
          <linearGradient id="luc-trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--luc-accent)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--luc-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#luc-trend-area)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--luc-accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-luc-muted">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </section>
  )
}
