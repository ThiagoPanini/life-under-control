import type { ReactNode } from "react"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  actionsAlign = "start",
  className = "",
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Alinhamento vertical opt-in das ações contra o bloco de título e descrição. */
  actionsAlign?: "start" | "center"
  className?: string
}) {
  return (
    <header
      className={`flex flex-wrap ${actionsAlign === "center" ? "items-center" : "items-start"} justify-between gap-4 ${className}`}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-luc-muted">{eyebrow}</div>}
        <h1 className="text-[25px] font-extrabold tracking-[-0.02em] text-luc-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-luc-text-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
