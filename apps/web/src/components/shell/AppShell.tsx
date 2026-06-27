"use client"

import { Calendar, LayoutDashboard, LogOut, PanelLeft, PanelLeftClose } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type ReactNode, useState } from "react"
import { logout } from "@/app/actions"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Logo } from "@/components/brand/Logo"
import { AREAS } from "@/core/domain/areas"

/** Cookie da preferência de colapso — lido no servidor pra pintar a largura
 * certa já no primeiro frame (sem flash de hidratação). */
export const SIDEBAR_COOKIE = "luc:sidebar-collapsed"

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"

/** Casca do app: sidebar colapsável (estado em cookie, lido no SSR) + conteúdo. */
export function AppShell({
  children,
  initialCollapsed = false,
}: {
  children: ReactNode
  initialCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const pathname = usePathname()

  function toggle() {
    setCollapsed((atual) => {
      const proximo = !atual
      // biome-ignore lint/suspicious/noDocumentCookie: cookie simples de preferência de UI, lido no SSR.
      document.cookie = `${SIDEBAR_COOKIE}=${proximo}; path=/; max-age=31536000; samesite=lax`
      return proximo
    })
  }

  return (
    <div className="flex min-h-dvh bg-luc-bg">
      <aside
        data-collapsed={collapsed}
        style={{ width: collapsed ? "var(--luc-sidebar-w-collapsed)" : "var(--luc-sidebar-w)" }}
        className="flex shrink-0 flex-col gap-6 border-luc-border border-r bg-luc-surface-1 px-3 py-5 transition-[width] duration-200"
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
                active={pathname === `/areas/${area.slug}`}
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
              className={`flex w-full items-center gap-2.5 rounded-luc-md px-2.5 py-2 text-luc-text-2 transition-colors hover:bg-luc-surface-2 hover:text-luc-text ${FOCUS}`}
            >
              <LogOut size={18} strokeWidth={1.7} aria-hidden />
              {!collapsed && <span className="text-sm">Sair</span>}
            </button>
          </form>

          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={`flex items-center gap-2.5 rounded-luc-md px-2.5 py-2 text-luc-text-2 transition-colors hover:bg-luc-surface-2 hover:text-luc-text ${FOCUS}`}
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

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  )
}

function NavItem({
  href,
  label,
  active,
  collapsed,
  children,
}: {
  href: string
  label: string
  active: boolean
  collapsed: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 rounded-luc-md px-2.5 py-2 text-sm transition-colors ${FOCUS} ${
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
