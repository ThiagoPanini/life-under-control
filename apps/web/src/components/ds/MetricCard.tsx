import type { ReactNode } from "react"

export function MetricCard({
  label,
  value,
  support,
  tone = "default",
  className = "",
}: {
  label: string
  value: ReactNode
  support?: ReactNode
  tone?: "default" | "accent" | "success" | "warn"
  className?: string
}) {
  const tones = {
    default: "text-luc-text",
    accent: "text-luc-accent",
    success: "text-luc-success",
    warn: "text-luc-warn",
  }

  return (
    <section
      className={`rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4 ${className}`}
    >
      <div className="text-[11.5px] font-semibold text-luc-text-3">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-semibold tracking-[-0.02em] ${tones[tone]}`}>
        {value}
      </div>
      {support && <div className="mt-1 text-[11px] text-luc-muted">{support}</div>}
    </section>
  )
}
