"use client"

import {
  Calendar,
  ChevronRight,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import { logout } from "@/app/actions"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Logo } from "@/components/brand/Logo"
import { PersonAvatar } from "@/components/ds/PersonAvatar"
import { Pill } from "@/components/ds/Pill"
import { AREAS, type Area } from "@/core/domain/areas"
import { buildNavModel, type NavArea, naArea } from "@/core/domain/nav-model"
import { SUBJECTS } from "@/core/domain/subjects"

export const SIDEBAR_STORAGE_KEY = "luc:sidebar-collapsed"
export const SIDEBAR_EXPANDED_STORAGE_KEY = "luc:sidebar-expanded"

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"

/** A Pessoa como a casca precisa pra desenhar o badge (id, exibição, foto). */
export type ShellPessoa = {
  id: string
  nome: string
  inicial: string
  avatarUrl?: string | null
}

/** Sem sessão carregada (ex.: testes de componente isolado), a casca ainda desenha os dois badges — só sem foto. */
const PESSOAS_PADRAO: ShellPessoa[] = [
  { id: "thiago", nome: "Thiago", inicial: "T" },
  { id: "jakeline", nome: "Jakeline", inicial: "J" },
]

/** Casca responsiva do app: sidebar no desktop e navegação dedicada no mobile. */
export function AppShell({
  children,
  pessoas = PESSOAS_PADRAO,
}: {
  children: ReactNode
  pessoas?: ShellPessoa[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
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
    setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1")
  }, [])

  useEffect(() => {
    if (pathname) {
      setMobileMenuOpen(false)
      setCommandOpen(false)
    }
  }, [pathname])

  useEffect(() => {
    function handleCommandKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen((current) => !current)
      } else if (event.key === "Escape") {
        setCommandOpen(false)
      }
    }

    document.addEventListener("keydown", handleCommandKey)
    return () => document.removeEventListener("keydown", handleCommandKey)
  }, [])

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
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0")
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
      <DesktopSidebar pathname={pathname} collapsed={collapsed} pessoas={pessoas} />

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

        <DesktopHeader
          label={currentLabel}
          collapsed={collapsed}
          onToggle={toggleDesktopSidebar}
          onOpenCommand={() => setCommandOpen(true)}
          pessoas={pessoas}
        />

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
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  )
}

function DesktopHeader({
  label,
  collapsed,
  onToggle,
  onOpenCommand,
  pessoas,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
  onOpenCommand: () => void
  pessoas: ShellPessoa[]
}) {
  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center justify-between border-luc-border border-b bg-luc-bg/70 px-6 backdrop-blur-lg lg:flex">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-luc-border bg-luc-surface-2 text-luc-text-3 transition-colors hover:border-luc-border-strong hover:text-luc-text ${FOCUS}`}
        >
          <PanelLeft size={16} strokeWidth={1.8} aria-hidden />
        </button>
        <div className="text-sm font-bold text-luc-text">{label}</div>
      </div>

      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onOpenCommand}
          aria-label="Buscar"
          className={`inline-flex min-h-[34px] items-center gap-2 rounded-luc-md border border-luc-border bg-luc-surface-2 px-3 text-[12.5px] text-luc-text-3 transition-colors hover:border-luc-border-strong hover:text-luc-text ${FOCUS}`}
        >
          <Search size={14} strokeWidth={1.8} aria-hidden />
          Buscar
          <kbd className="rounded-[5px] border border-luc-border-strong px-1.5 font-mono text-[11px] text-luc-muted">
            ⌘K
          </kbd>
        </button>
        <div className="flex items-center gap-1">
          {pessoas.map((pessoa) => (
            <ShellPersonBadge key={pessoa.id} pessoa={pessoa} />
          ))}
        </div>
      </div>
    </header>
  )
}

/** Lê o array de slugs persistido; qualquer formato inesperado vira conjunto vazio, nunca exceção. */
function parseSlugSet(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item): item is string => typeof item === "string"))
  } catch {
    return new Set()
  }
}

function DesktopSidebar({
  pathname,
  collapsed,
  pessoas,
}: {
  pathname: string
  collapsed: boolean
  pessoas: ShellPessoa[]
}) {
  const navModel = buildNavModel(pathname)
  const rotaAtivaSlug = navModel.find((area) => area.ativa)?.slug
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set())
  const primeiraRotaRef = useRef(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: hidratação de montagem — só usa rotaAtivaSlug se não houver preferência persistida
  useEffect(() => {
    const persisted = localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)
    const inicial = persisted ? parseSlugSet(persisted) : new Set<string>()
    if (!persisted && rotaAtivaSlug) inicial.add(rotaAtivaSlug)
    setExpandedAreas(inicial)
  }, [])

  useEffect(() => {
    if (primeiraRotaRef.current) {
      primeiraRotaRef.current = false
      return
    }
    if (!rotaAtivaSlug) return
    setExpandedAreas((current) =>
      current.has(rotaAtivaSlug) ? current : new Set(current).add(rotaAtivaSlug),
    )
  }, [rotaAtivaSlug])

  function toggleArea(slug: string) {
    setExpandedAreas((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  return (
    <aside
      data-collapsed={collapsed}
      style={{ width: collapsed ? "var(--luc-sidebar-w-collapsed)" : "var(--luc-sidebar-w)" }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain border-luc-border border-r bg-luc-surface-1 px-3 py-[18px] transition-[width] [transition-duration:180ms] lg:flex"
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
          {collapsed
            ? AREAS.map((area) => (
                <NavItem
                  key={area.slug}
                  href={`/areas/${area.slug}`}
                  label={area.nome}
                  active={naArea(pathname, area.slug)}
                  collapsed={collapsed}
                  areaState={area.estado}
                >
                  <AreaIcon name={area.icon} size={18} />
                </NavItem>
              ))
            : navModel.map((area) => (
                <AreaNavGroup
                  key={area.slug}
                  area={area}
                  expanded={expandedAreas.has(area.slug)}
                  onToggle={() => toggleArea(area.slug)}
                />
              ))}
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-2 border-luc-border border-t pt-3">
        <div className={`flex items-center ${collapsed ? "flex-col gap-1.5" : "gap-1.5 px-2"}`}>
          {pessoas.map((pessoa) => (
            <ShellPersonBadge key={pessoa.id} pessoa={pessoa} />
          ))}
          {!collapsed && (
            <span className="ml-1 text-[10.5px] leading-tight text-luc-muted">
              Thiago · Jakeline
              <br />
              <span className="text-luc-disabled">acesso simétrico</span>
            </span>
          )}
        </div>
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
      </div>
    </aside>
  )
}

/**
 * Linha de Área na sidebar expandida (issue #46, ADR-0009): Área com Assuntos é
 * um toggle puro (nunca navega); Área em-breve sem Assuntos fica inerte.
 */
function AreaNavGroup({
  area,
  expanded,
  onToggle,
}: {
  area: NavArea
  expanded: boolean
  onToggle: () => void
}) {
  const assuntosId = `area-assuntos-${area.slug}`

  if (!area.expandivel) {
    return (
      <div
        aria-disabled="true"
        aria-current={area.ativa ? "page" : undefined}
        className={`relative flex min-h-10 items-center gap-3 rounded-luc-md px-3 text-[13.5px] font-semibold ${
          area.ativa ? "bg-luc-accent-12 text-luc-text" : "text-luc-disabled"
        }`}
      >
        {area.ativa && (
          <span
            aria-hidden
            className="absolute top-2 bottom-2 -left-3 w-[2.5px] rounded-full bg-luc-accent"
          />
        )}
        <span className="shrink-0">
          <AreaIcon name={area.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1 truncate">{area.nome}</span>
        <span className="shrink-0 rounded-[5px] border border-luc-border px-1.5 py-px text-[9.5px] font-medium text-luc-faint">
          em breve
        </span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={assuntosId}
        onClick={onToggle}
        className={`relative flex min-h-10 w-full items-center gap-3 rounded-luc-md px-3 text-[13.5px] font-semibold transition-colors ${FOCUS} ${
          area.ativa
            ? "bg-luc-accent-12 text-luc-text"
            : "text-luc-text-2 hover:bg-luc-surface-2 hover:text-luc-text"
        }`}
      >
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 text-luc-text-3 transition-transform [transition-duration:160ms] ${expanded ? "rotate-90" : ""}`}
        />
        <span className="shrink-0">
          <AreaIcon name={area.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{area.nome}</span>
        {area.estado === "ativa" && (
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-luc-success" />
        )}
      </button>
      {expanded && (
        <nav
          id={assuntosId}
          aria-label={`Assuntos de ${area.nome}`}
          className="mt-0.5 ml-[27px] flex flex-col gap-0.5 border-luc-border border-l pl-2.5"
        >
          {area.assuntos.map((subject) =>
            subject.inerte ? (
              <div
                key={subject.slug}
                aria-disabled="true"
                className="flex min-h-8 items-center gap-2 rounded-luc-md px-2.5 text-[13px] text-luc-disabled"
              >
                <span className="min-w-0 flex-1 truncate">{subject.nome}</span>
                <Pill tone="warn">em breve</Pill>
              </div>
            ) : (
              <Link
                key={subject.slug}
                href={subject.href}
                aria-current={subject.ativa ? "page" : undefined}
                className={`relative flex min-h-8 items-center rounded-luc-md px-2.5 text-[13px] font-medium transition-colors ${FOCUS} ${
                  subject.ativa
                    ? "bg-luc-accent-12 text-luc-text"
                    : "text-luc-text-2 hover:bg-luc-surface-2 hover:text-luc-text"
                }`}
              >
                {subject.ativa && (
                  <span
                    aria-hidden
                    className="absolute top-1.5 bottom-1.5 -left-[13px] w-[2px] rounded-full bg-luc-accent"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{subject.nome}</span>
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
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
        className={`absolute inset-0 bg-luc-bg/80 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
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
                areaState={area.estado}
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
  areaState,
  children,
}: {
  href: string
  label: string
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
  areaState?: Area["estado"]
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={`relative flex min-h-10 items-center rounded-luc-md text-[13.5px] font-semibold transition-colors ${FOCUS} ${
        collapsed ? "justify-center px-0" : "gap-3 px-3"
      } ${
        active
          ? "bg-luc-accent-12 text-luc-text"
          : "text-luc-text-2 hover:bg-luc-surface-2 hover:text-luc-text"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-2 bottom-2 -left-3 w-[2.5px] rounded-full bg-luc-accent"
        />
      )}
      <span className="shrink-0">{children}</span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && areaState === "ativa" && (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-luc-success" />
      )}
      {!collapsed && areaState === "em-breve" && (
        <span className="shrink-0 rounded-[5px] border border-luc-border px-1.5 py-px text-[9.5px] font-medium text-luc-faint">
          em breve
        </span>
      )}
      {collapsed && areaState === "ativa" && (
        <span
          aria-hidden
          className="absolute top-1.5 right-2.5 h-[5px] w-[5px] rounded-full bg-luc-success"
        />
      )}
    </Link>
  )
}

/** Chave de cor por Pessoa (o Lar tem exatamente 2 — invariante #2); qualquer 3ª cai em "thiago". */
function shellPersonKey(nome: string): "thiago" | "jakeline" {
  return nome.toLocaleLowerCase("pt-BR") === "jakeline" ? "jakeline" : "thiago"
}

function ShellPersonBadge({ pessoa }: { pessoa: ShellPessoa }) {
  const key = shellPersonKey(pessoa.nome)
  const colors = {
    color: `var(--luc-${key}-fg)`,
    backgroundColor: `var(--luc-${key}-bg)`,
  } satisfies CSSProperties

  return (
    <PersonAvatar
      avatarUrl={pessoa.avatarUrl}
      inicial={pessoa.inicial}
      nome={pessoa.nome}
      size={26}
      colors={colors}
      className="rounded-[8px]"
    />
  )
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    dialogRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus()
  }, [open])

  if (!open) return null

  const destinations = [
    { href: "/painel", label: "Painel", hint: "visão do Lar", icon: <LayoutDashboard /> },
    ...SUBJECTS.filter((subject) => subject.estado === "ativa").map((subject) => ({
      href: `/areas/${subject.areaSlug}/${subject.slug}`,
      label: subject.nome,
      hint: subject.resumo ?? "",
      icon: <AreaIcon name={subject.icon} />,
    })),
    { href: "/agenda", label: "Agenda", hint: "o que vence", icon: <Calendar /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
      <button
        type="button"
        aria-label="Fechar busca"
        onClick={onClose}
        className="absolute inset-0 bg-luc-bg/70 backdrop-blur-[3px]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="relative w-full max-w-[520px] overflow-hidden rounded-[15px] border border-luc-border-strong bg-luc-surface-3 shadow-[0_24px_60px_rgba(0,0,0,.5)]"
      >
        <div className="flex items-center gap-3 border-luc-border border-b px-[18px] py-[15px]">
          <Search size={16} strokeWidth={1.8} className="text-luc-text-3" aria-hidden />
          <h2 id="command-palette-title" className="text-sm text-luc-muted">
            Ir para…
          </h2>
        </div>
        <nav aria-label="Destinos" className="p-[7px]">
          {destinations.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-luc-md px-3 py-2.5 text-[13.5px] text-luc-text transition-colors hover:bg-white/[0.04] ${FOCUS}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white/[0.05] text-luc-text-2 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:stroke-[1.7]">
                {destination.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{destination.label}</span>
              <span className="text-[11.5px] text-luc-muted">{destination.hint}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
