import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"

/** Botão oficial do LUC. Com `href`, vira link; sem `href`, mantém semântica nativa de botão. */
export type ButtonVariant = "primary" | "secondary" | "ghost"

const BASE =
  "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-[11px] px-4 py-2 text-[13.5px] font-semibold transition-[color,background-color,border-color,transform] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg disabled:cursor-not-allowed disabled:border-luc-border disabled:bg-luc-surface-2 disabled:text-luc-disabled disabled:opacity-100 disabled:active:translate-y-0"

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-luc-accent font-bold text-luc-bg hover:bg-luc-accent-bright",
  secondary:
    "border border-luc-border bg-luc-surface-2 text-luc-text hover:border-luc-accent hover:text-luc-accent",
  ghost:
    "border border-transparent bg-transparent text-luc-text-2 hover:bg-luc-surface-2 hover:text-luc-text",
}

type SharedProps = {
  variant?: ButtonVariant
  className?: string
  children: ReactNode
  disabled?: boolean
}

type NativeButtonProps = SharedProps &
  Omit<ComponentProps<"button">, "children" | "className" | "disabled"> & {
    href?: never
  }

type LinkButtonProps = SharedProps &
  Omit<ComponentProps<typeof Link>, "children" | "className" | "href"> & {
    href: ComponentProps<typeof Link>["href"]
  }

export type ButtonProps = NativeButtonProps | LinkButtonProps

export function Button(props: ButtonProps) {
  const { variant = "primary", className = "", children, disabled = false } = props
  const cls = `${BASE} ${VARIANTS[variant]} ${className}`
  if ("href" in props && props.href != null) {
    const {
      href,
      variant: _variant,
      className: _className,
      children: _children,
      disabled: _disabled,
      ...rest
    } = props
    return (
      <Link
        href={href}
        className={`${cls} ${disabled ? "pointer-events-none border-luc-border bg-luc-surface-2 text-luc-disabled" : ""}`}
        data-variant={variant}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : rest.tabIndex}
        {...rest}
      >
        {children}
      </Link>
    )
  }

  const {
    variant: _variant,
    className: _className,
    children: _children,
    href: _href,
    ...rest
  } = props
  return (
    <button type="button" className={cls} data-variant={variant} disabled={disabled} {...rest}>
      {children}
    </button>
  )
}
