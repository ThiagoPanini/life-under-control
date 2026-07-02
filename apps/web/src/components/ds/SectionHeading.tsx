import type { ReactNode } from "react"

/** Título de seção — eyebrow mono (emenda #57 do contrato de design) + subtítulo opcional. */
export function SectionHeading({
  title,
  suffix,
  subtitle,
  actions,
  id,
  className = "",
}: {
  title: string
  suffix?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  id?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2
          id={id}
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-luc-text-2"
        >
          {title}
          {suffix != null && <span className="text-luc-faint"> {suffix}</span>}
        </h2>
        {actions}
      </div>
      {subtitle && <p className="text-[13px] leading-relaxed text-luc-text-2">{subtitle}</p>}
    </div>
  )
}
