import type { ComponentProps, ReactNode } from "react"

/** Selo compacto de estado. Cor sempre acompanha um rótulo textual. */
export type PillTone = "neutral" | "muted" | "accent" | "success" | "warn" | "coming-soon"

const TONES: Record<PillTone, string> = {
  neutral: "border-transparent bg-white/[0.06] text-luc-text-2",
  muted: "border-transparent bg-white/[0.05] text-luc-text-3",
  accent: "border-transparent bg-luc-accent-16 text-luc-accent-bright",
  success: "border-transparent bg-luc-success/10 text-luc-success",
  warn: "border-transparent bg-luc-warn/10 text-luc-warn",
  "coming-soon": "border-luc-warn/20 bg-luc-warn/10 text-luc-warn",
}

export function Pill({
  tone = "neutral",
  children,
  className = "",
  ...rest
}: {
  tone?: PillTone
  children: ReactNode
  className?: string
} & Omit<ComponentProps<"span">, "children" | "className">) {
  return (
    <span
      data-tone={tone}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-luc-sm border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}
