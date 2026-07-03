"use client"

import { X } from "lucide-react"
import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useId, useRef } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Diálogo responsivo do LUC: painel central no desktop e tela cheia no mobile. */
export function Modal({
  title,
  eyebrow,
  description,
  closeHref,
  children,
  width = "wide",
}: {
  title: string
  eyebrow?: string
  description?: string
  closeHref: string
  children: ReactNode
  width?: "wide" | "compact"
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  function close() {
    router.replace(closeHref, { scroll: false })
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== "Tab") return
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  })

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar diálogo"
        onClick={close}
        className="absolute inset-0 bg-luc-bg/80 backdrop-blur-[6px] [animation:luc-modal-backdrop_160ms_ease-out]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative flex h-dvh w-full flex-col overflow-hidden border-luc-border-strong bg-luc-surface-3 shadow-[0_32px_100px_rgba(0,0,0,.72)] [animation:luc-modal-enter_180ms_ease-out] sm:h-auto sm:max-h-[min(90dvh,820px)] sm:rounded-luc-xl sm:border ${width === "compact" ? "sm:max-w-[620px]" : "sm:max-w-[760px]"}`}
      >
        <header className="flex shrink-0 items-start gap-4 border-luc-border border-b px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-luc-accent">
                {eyebrow}
              </p>
            )}
            <h1
              id={titleId}
              className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-luc-text sm:text-2xl"
            >
              {title}
            </h1>
            {description && (
              <p
                id={descriptionId}
                className="mt-1 max-w-[58ch] text-[12px] leading-relaxed text-luc-text-3"
              >
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Fechar"
            onClick={close}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-luc-md text-luc-text-2 transition-colors hover:bg-luc-surface-2 hover:text-luc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
          >
            <X aria-hidden size={19} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  )
}
