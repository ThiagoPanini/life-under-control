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
  descriptionMono = false,
  icon,
  closeHref,
  children,
  width = "wide",
  travado = false,
}: {
  title: string
  eyebrow?: string
  description?: string
  /** Contexto em mono (ex.: "competência · vencimento") — modal compacto (Final, #87). */
  descriptionMono?: boolean
  /** Chip 28×28 antes do título — hoje só o ícone da Conta no modal compacto. */
  icon?: ReactNode
  closeHref: string
  children: ReactNode
  /** "narrow": 400px + entrada luc-modal-pop + padding 18px — hoje só o modal de Registrar pagamento (Final, #87). */
  width?: "wide" | "compact" | "narrow"
  /**
   * Trava os descartes **silenciosos** (Escape/backdrop) enquanto uma operação
   * está em curso — o X rotulado segue funcional como saída deliberada (#100, AC13).
   */
  travado?: boolean
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  function fechar() {
    router.replace(closeHref, { scroll: false })
  }

  // Escape e backdrop são descartes silenciosos: uma operação em andamento os
  // ignora, para não abandonar o fluxo sem decisão explícita (#100, AC13).
  function fecharSilencioso() {
    if (travado) return
    fechar()
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        fecharSilencioso()
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

  // O cartão narrow segue o protótipo Final à risca: central COM margem também
  // no celular (nunca tela cheia), 400px, raio 16, padding 18px, header sem
  // divisória, eyebrow sans text-3 e título 14.5px. Os demais larguras mantêm a
  // casca clássica (tela cheia no mobile, header com divisória).
  const narrow = width === "narrow"

  if (narrow) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-5">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Fechar diálogo"
          onClick={fecharSilencioso}
          className="absolute inset-0 bg-luc-bg/70 backdrop-blur-[3px] [animation:luc-modal-backdrop_160ms_ease-out]"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          className="relative flex max-h-[calc(100dvh-40px)] w-full max-w-[400px] flex-col overflow-hidden rounded-luc-xl border border-luc-border-strong bg-luc-surface-3 shadow-[0_24px_60px_rgba(0,0,0,.5)] [animation:luc-modal-pop_200ms_ease-out]"
        >
          <header className="flex shrink-0 items-start justify-between gap-2.5 px-[18px] pt-[18px]">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-luc-text-3">
                  {eyebrow}
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-[9px]">
                {icon}
                <h1 id={titleId} className="truncate text-[14.5px] font-bold text-luc-text">
                  {title}
                </h1>
              </div>
              {description && (
                <p
                  id={descriptionId}
                  className={`mt-1.5 ${descriptionMono ? "font-mono text-[10.5px] text-luc-muted" : "text-[12px] leading-relaxed text-luc-text-3"}`}
                >
                  {description}
                </p>
              )}
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label="Fechar"
              onClick={fechar}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-luc-text-3 transition-colors hover:text-luc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
            >
              <X aria-hidden size={16} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pt-4 pb-[18px]">
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar diálogo"
        onClick={fecharSilencioso}
        className="absolute inset-0 bg-luc-bg/80 backdrop-blur-[6px] [animation:luc-modal-backdrop_160ms_ease-out]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative flex h-dvh w-full flex-col overflow-hidden border-luc-border-strong bg-luc-surface-3 shadow-[0_32px_100px_rgba(0,0,0,.72)] sm:h-auto sm:max-h-[min(90dvh,820px)] sm:rounded-luc-xl sm:border ${
          width === "compact"
            ? "sm:max-w-[620px] [animation:luc-modal-enter_180ms_ease-out]"
            : "sm:max-w-[760px] [animation:luc-modal-enter_180ms_ease-out]"
        }`}
      >
        <header className="flex shrink-0 items-start gap-4 border-luc-border border-b px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-luc-accent">
                {eyebrow}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2.5">
              {icon}
              <h1
                id={titleId}
                className="text-xl font-extrabold tracking-[-0.025em] text-luc-text sm:text-2xl"
              >
                {title}
              </h1>
            </div>
            {description && (
              <p
                id={descriptionId}
                className={`mt-1 max-w-[58ch] leading-relaxed text-luc-text-3 ${descriptionMono ? "font-mono text-[11px]" : "text-[12px]"}`}
              >
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Fechar"
            onClick={fechar}
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
