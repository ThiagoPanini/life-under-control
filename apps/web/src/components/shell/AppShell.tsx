"use client"

import {
  Calendar,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { logout } from "@/app/actions"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Logo } from "@/components/brand/Logo"
import { AREAS } from "@/core/domain/areas"

/** Cookie da preferência de colapso — lido no servidor pra pintar a largura
 * certa já no primeiro frame (sem flash de hidratação). */
export const SIDEBAR_COOKIE = "luc:sidebar-collapsed"

/** A rota está dentro de uma Área (a própria ou uma sub-rota como /nova)? */
function naArea(pathname: string, slug: string): boolean {
  return pathname === `/areas/${slug}` || pathname.startsWith(`/areas/${slug}/`)
}

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"

/** Casca responsiva do app: sidebar no desktop e navegação dedicada no mobile. */
export function AppShell({
  children,
  initialCollapsed = false,
}: {
  children: ReactNode
  initialCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null)
  const mobileDialogRef = useRef<HTMLElement>(null)

  const currentLabel =
    pathname === "/painel"
      ? "Painel"
      : pathname === "/agenda"
        ? "Agenda"
        : (AREAS.find((area) => naArea(pathname, area.slug))?.nome ?? "Life Under Control")

  useEffect(() => {
    if (pathname) setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const desktopMedia = window.matchMedia?.("(min-width: 64rem)")
    if (!desktopMedia) return

    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setMobileMenuOpen(false)
    }

    desktopMedia.addEventListener("change", closeOnDesktop)
    return () => desktopMedia.removeEventListener("change", closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    mobileCloseButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false)
        return
      }

      if (event.key !== "Tab") return
      const focusable = mobileDialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [mobileMenuOpen])

  function toggleDesktopSidebar() {
    setCollapsed((current) => {
      const next = !current
      // biome-ignore lint/suspicious/noDocumentCookie: cookie simples de preferência de UI, lido no SSR.
      document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  }

  function openMobileMenu() {
    setMobileMenuOpen(true)
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false)
  }

  return (
    <div className="flex min-h-dvh bg-luc-bg">
      <a
        href="#conteudo-principal"
        className={`fixed top-[max(0.75rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-[60] -translate-y-24 rounded-luc-md bg-luc-accent px-4 py-3 font-semibold text-luc-bg text-sm transition-transform focus:translate-y-0 ${FOCUS}`}
      >
        Pular para o conteúdo
      </a>
      <DesktopSidebar pathname={pathname} collapsed={collapsed} onToggle={toggleDesktopSidebar} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-end border-luc-border border-b bg-luc-bg/92 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pb-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
          <Link
            href="/painel"
            aria-label="Ir ao Painel"
            className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-luc-md ${FOCUS}`}
          >
            <Logo size={30} decorative />
            <span className="truncate font-semibold text-sm text-luc-text tracking-[-0.02em]">
              {currentLabel}
            </span>
          </Link>
          <button
            ref={mobileMenuButtonRef}
            type="button"
            aria-label="Abrir menu"
            aria-controls="mobile-navigation-drawer"
            aria-expanded={mobileMenuOpen}
            onClick={openMobileMenu}
            className={`ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-luc-md border border-luc-border bg-luc-surface-1 text-luc-text transition-colors active:bg-luc-surface-2 ${FOCUS}`}
          >
            <Menu size={21} strokeWidth={1.8} aria-hidden />
          </button>
        </header>

        <main
          id="conteudo-principal"
          tabIndex={-1}
          className="min-w-0 flex-1 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0"
        >
          {children}
        </main>
      </div>

      <MobileMenu
        open={mobileMenuOpen}
        pathname={pathname}
        dialogRef={mobileDialogRef}
        closeButtonRef={mobileCloseButtonRef}
        onClose={closeMobileMenu}
      />
      <MobileDock pathname={pathname} menuOpen={mobileMenuOpen} onOpenAreas={openMobileMenu} />
    </div>
  )
}

function DesktopSidebar({
  pathname,
  collapsed,
  onToggle,
}: {
  pathname: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <aside
      data-collapsed={collapsed}
      style={{ width: collapsed ? "var(--luc-sidebar-w-collapsed)" : "var(--luc-sidebar-w)" }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 overflow-y-auto overscroll-contain border-luc-border border-r bg-luc-surface-1 px-3 py-5 transition-[width] duration-200 lg:flex"
    >
      <Link
        href="/painel"
        className={`flex items-center gap-2.5 rounded-luc-md px-1.5 ${FOCUS}`}
        title={collapsed ? "Life Under Control" : undefined}
      >
        <Logo size={26} decorative={!collapsed} />
        {!collapsed && (
          <span className="truncate font-semibold text-luc-text tracking-[-0.02em]">
            Life Under Control
          </span>
        )}
      </Link>

      <nav aria-label="Principal" className="flex flex-col gap-1">
        <NavItem
          href="/painel"
          label="Painel"
          active={pathname === "/painel"}
          collapsed={collapsed}
        >
          <LayoutDashboard size={18} strokeWidth={1.7} aria-hidden />
        </NavItem>
        <NavItem
          href="/agenda"
          label="Agenda"
          active={pathname === "/agenda"}
          collapsed={collapsed}
        >
          <Calendar size={18} strokeWidth={1.7} aria-hidden />
        </NavItem>
      </nav>

      <div className="flex flex-col gap-1">
        {!collapsed && (
          <p className="px-2.5 pb-1 font-mono text-[10px] text-luc-text-3 uppercase tracking-[0.16em]">
            Áreas
          </p>
        )}
        <nav aria-label="Áreas" className="flex flex-col gap-1">
          {AREAS.map((area) => (
            <NavItem
              key={area.slug}
              href={`/areas/${area.slug}`}
              label={area.nome}
              active={naArea(pathname, area.slug)}
              collapsed={collapsed}
            >
              <AreaIcon name={area.icon} size={18} />
            </NavItem>
          ))}
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-1 border-luc-border border-t pt-3">
        <form action={logout}>
          <button
            type="submit"
            aria-label="Sair"
            title={collapsed ? "Sair" : undefined}
            className={`flex min-h-11 w-full items-center rounded-luc-md text-luc-text-2 transition-colors hover:bg-luc-surface-2 hover:text-luc-text ${collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"} ${FOCUS}`}
          >
            <LogOut size={18} strokeWidth={1.7} aria-hidden />
            {!collapsed && <span className="text-sm">Sair</span>}
          </button>
        </form>

        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={`flex min-h-11 items-center rounded-luc-md text-luc-text-2 transition-colors hover:bg-luc-surface-2 hover:text-luc-text ${collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"} ${FOCUS}`}
        >
          {collapsed ? (
            <PanelLeft size={18} aria-hidden />
          ) : (
            <PanelLeftClose size={18} aria-hidden />
          )}
          {!collapsed && <span className="text-sm">Recolher</span>}
        </button>
      </div>
    </aside>
  )
}

function MobileMenu({
  open,
  pathname,
  dialogRef,
  closeButtonRef,
  onClose,
}: {
  open: boolean
  pathname: string
  dialogRef: React.RefObject<HTMLElement | null>
  closeButtonRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  return (
    <div
      data-open={open}
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-50 lg:hidden ${open ? "visible" : "invisible pointer-events-none"}`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        aria-label="Fechar menu"
        onClick={onClose}
        className={`absolute inset-0 bg-black/70 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        id="mobile-navigation-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
        className={`absolute inset-y-0 left-0 flex h-dvh w-[min(88vw,21rem)] flex-col overflow-y-auto overscroll-contain border-luc-border border-r bg-luc-surface-1 pr-4 pl-[max(1rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex min-h-12 items-center gap-3 border-luc-border border-b pb-4">
          <Logo size={32} decorative />
          <div className="min-w-0 flex-1">
            <p id="mobile-menu-title" className="truncate font-semibold text-luc-text">
              Life Under Control
            </p>
            <p className="font-mono text-[10px] text-luc-accent uppercase tracking-[0.16em]">
              Cockpit do Lar
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-luc-md text-luc-text-2 transition-colors active:bg-luc-surface-2 active:text-luc-text ${FOCUS}`}
          >
            <X size={21} strokeWidth={1.8} aria-hidden />
          </button>
        </div>

        <nav aria-label="Principal móvel" className="mt-5 flex flex-col gap-1">
          <NavItem
            href="/painel"
            label="Painel"
            active={pathname === "/painel"}
            onNavigate={onClose}
          >
            <LayoutDashboard size={19} strokeWidth={1.7} aria-hidden />
          </NavItem>
          <NavItem
            href="/agenda"
            label="Agenda"
            active={pathname === "/agenda"}
            onNavigate={onClose}
          >
            <Calendar size={19} strokeWidth={1.7} aria-hidden />
          </NavItem>
        </nav>

        <div className="mt-6 flex flex-col gap-1">
          <p className="px-3 pb-1 font-mono text-[10px] text-luc-text-3 uppercase tracking-[0.16em]">
            Áreas
          </p>
          <nav aria-label="Áreas móvel" className="flex flex-col gap-1">
            {AREAS.map((area) => (
              <NavItem
                key={area.slug}
                href={`/areas/${area.slug}`}
                label={area.nome}
                active={naArea(pathname, area.slug)}
                onNavigate={onClose}
              >
                <AreaIcon name={area.icon} size={19} />
              </NavItem>
            ))}
          </nav>
        </div>

        <form action={logout} className="mt-auto border-luc-border border-t pt-4">
          <button
            type="submit"
            aria-label="Sair"
            className={`flex min-h-11 w-full items-center gap-3 rounded-luc-md px-3 text-luc-text-2 transition-colors active:bg-luc-surface-2 active:text-luc-text ${FOCUS}`}
          >
            <LogOut size={19} strokeWidth={1.7} aria-hidden />
            <span className="text-sm">Sair</span>
          </button>
        </form>
      </aside>
    </div>
  )
}

function MobileDock({
  pathname,
  menuOpen,
  onOpenAreas,
}: {
  pathname: string
  menuOpen: boolean
  onOpenAreas: () => void
}) {
  const areaActive = pathname.startsWith("/areas/")
  return (
    <nav
      aria-label="Navegação móvel"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 gap-1 border-luc-border border-t bg-luc-surface-1/95 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
    >
      <MobileDockLink href="/painel" label="Painel" active={pathname === "/painel"}>
        <LayoutDashboard size={20} strokeWidth={1.7} aria-hidden />
      </MobileDockLink>
      <MobileDockLink href="/agenda" label="Agenda" active={pathname === "/agenda"}>
        <Calendar size={20} strokeWidth={1.7} aria-hidden />
      </MobileDockLink>
      <button
        type="button"
        aria-label="Abrir Áreas"
        aria-current={areaActive ? "page" : undefined}
        aria-controls="mobile-navigation-drawer"
        aria-expanded={menuOpen}
        onClick={onOpenAreas}
        className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-luc-md font-medium text-[11px] transition-colors active:bg-luc-surface-2 ${FOCUS} ${areaActive ? "text-luc-accent" : "text-luc-text-2"}`}
      >
        <Grid2X2 size={20} strokeWidth={1.7} aria-hidden />
        Áreas
      </button>
    </nav>
  )
}

function MobileDockLink({
  href,
  label,
  active,
  children,
}: {
  href: string
  label: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-luc-md font-medium text-[11px] transition-colors active:bg-luc-surface-2 ${FOCUS} ${active ? "text-luc-accent" : "text-luc-text-2"}`}
    >
      {children}
      {label}
    </Link>
  )
}

function NavItem({
  href,
  label,
  active,
  collapsed = false,
  onNavigate,
  children,
}: {
  href: string
  label: string
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={`flex min-h-11 items-center rounded-luc-md text-sm transition-colors ${FOCUS} ${
        collapsed ? "justify-center px-0" : "gap-3 px-3"
      } ${
        active
          ? "bg-luc-surface-2 text-luc-text"
          : "text-luc-text-2 hover:bg-luc-surface-2 hover:text-luc-text"
      }`}
    >
      <span className="shrink-0">{children}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}
