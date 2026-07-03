import type { ReactNode } from "react"

/** Título de seção — eyebrow mono (emenda #57 do contrato de design) + subtítulo opcional. */
export function SectionHeading({
  title,
  suffix,
  subtitle,
  actions,
  icon,
  variant = "default",
  id,
  className = "",
}: {
  title: string
  suffix?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Ícone (já pronto, ex.: chip) exibido antes do título — só a variante "destaque" usa. */
  icon?: ReactNode
  /** "destaque" (#86): título maior, sem o tratamento eyebrow mono — variante local, opt-in. */
  variant?: "default" | "destaque"
  id?: string
  className?: string
}) {
  const destaque = variant === "destaque"

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-[9px]">
          {icon}
          <h2
            id={id}
            className={
              destaque
                ? "font-extrabold text-[17px] text-luc-text tracking-[-0.01em]"
                : "font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-luc-text-2"
            }
          >
            {title}
            {suffix != null && <span className="text-luc-faint"> {suffix}</span>}
          </h2>
        </div>
        {actions}
      </div>
      {subtitle && <p className="text-[13px] leading-relaxed text-luc-text-2">{subtitle}</p>}
    </div>
  )
}
