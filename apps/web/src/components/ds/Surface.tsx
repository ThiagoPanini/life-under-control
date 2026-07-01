import type { ComponentProps } from "react"

export function Surface({ className = "", ...props }: ComponentProps<"section">) {
  return (
    <section
      className={`rounded-[14px] border border-luc-border bg-luc-surface-2 ${className}`}
      {...props}
    />
  )
}
