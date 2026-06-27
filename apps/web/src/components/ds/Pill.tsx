import type { ReactNode } from "react"

/** Selo compacto do design system (Mirante). `tone` define a cor. */
export type PillTone = "neutral" | "muted" | "accent"

const TONES: Record<PillTone, string> = {
  neutral: "border-luc-border bg-luc-surface-2 text-luc-text-2",
  muted: "border-luc-border bg-luc-surface-2 text-luc-text-3",
  accent: "border-luc-border bg-luc-surface-3 text-luc-accent",
}

export function Pill({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: PillTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      data-tone={tone}
      className={`inline-flex items-center gap-1.5 rounded-luc-sm border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
