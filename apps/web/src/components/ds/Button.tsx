import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"

/** Botão do design system (Mirante). Com `href`, vira link; senão, <button>. */
export type ButtonVariant = "primary" | "ghost"

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-luc-md px-4 py-2 text-sm font-medium transition-colors"

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-luc-accent text-luc-bg hover:bg-luc-accent-bright",
  ghost:
    "border border-luc-border bg-luc-surface-2 text-luc-text hover:border-luc-accent hover:text-luc-accent",
}

type ButtonProps = {
  variant?: ButtonVariant
  href?: string
  className?: string
  children: ReactNode
} & Omit<ComponentProps<"button">, "className" | "children">

export function Button({
  variant = "primary",
  href,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const cls = `${BASE} ${VARIANTS[variant]} ${className}`
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  )
}
