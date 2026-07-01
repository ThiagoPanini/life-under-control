// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// next/navigation e next/link não têm router montado nos testes — mockamos o mínimo.
vi.mock("next/navigation", () => ({ usePathname: () => "/painel" }))
// Evita puxar @/auth (next-auth) pelo server action de logout no ambiente de teste.
vi.mock("@/app/actions", () => ({ logout: async () => {} }))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { AreaCard } from "@/components/ds/AreaCard"
import { AppShell } from "./AppShell"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("AreaCard (Seam 3)", () => {
  it("test_area_em_breve_mostra_selo_semantico_e_link_correto", () => {
    render(
      <AreaCard
        area={{ slug: "financas", nome: "Finanças", icon: "wallet", estado: "em-breve" }}
      />,
    )

    const selo = screen.getByText("em breve")
    expect(selo).toBeInTheDocument()
    expect(selo).toHaveAttribute("data-tone", "coming-soon")
    expect(screen.getByText("Finanças").closest("a")).toHaveAttribute("href", "/areas/financas")
  })

  it("test_area_ativa_nao_mostra_selo_em_breve", () => {
    render(
      <AreaCard area={{ slug: "financas", nome: "Finanças", icon: "wallet", estado: "ativa" }} />,
    )

    expect(screen.queryByText("em breve")).toBeNull()
    expect(screen.getByText("Finanças").closest("a")).toHaveAttribute("href", "/areas/financas")
  })
})

describe("AppShell sidebar (Seam 3)", () => {
  it("test_colapso_grava_preferencia_local", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    const aside = container.querySelector("aside")
    expect(aside).toHaveAttribute("data-collapsed", "false")

    await user.click(screen.getByRole("button", { name: "Recolher menu" }))

    expect(localStorage.getItem("luc:sidebar-collapsed")).toBe("1")
    expect(aside).toHaveAttribute("data-collapsed", "true")
  })

  it("test_inicia_colapsado_pela_preferencia_local", async () => {
    localStorage.setItem("luc:sidebar-collapsed", "1")
    const { container } = render(<AppShell>conteúdo</AppShell>)

    expect(await screen.findByRole("button", { name: "Expandir menu" })).toBeInTheDocument()
    expect(container.querySelector("aside")).toHaveAttribute("data-collapsed", "true")
  })

  it("test_navegacao_principal_destaca_financas", () => {
    render(<AppShell>conteúdo</AppShell>)
    const principal = screen.getByRole("navigation", { name: "Principal" })

    expect(within(principal).getByRole("link", { name: "Finanças" })).toHaveAttribute(
      "href",
      "/areas/financas",
    )
  })

  it("test_command_palette_abre_pelo_atalho_e_lista_destinos_reais", async () => {
    const user = userEvent.setup()
    render(<AppShell>conteúdo</AppShell>)

    await user.keyboard("{Control>}k{/Control}")

    const dialog = screen.getByRole("dialog", { name: "Ir para…" })
    expect(within(dialog).getByRole("link", { name: /Painel/ })).toHaveAttribute("href", "/painel")
    expect(within(dialog).getByRole("link", { name: /Finanças/ })).toHaveAttribute(
      "href",
      "/areas/financas",
    )
    expect(within(dialog).getByRole("link", { name: /Agenda/ })).toHaveAttribute("href", "/agenda")
  })
})

describe("AppShell mobile", () => {
  it("test_dock_movel_mantem_rotas_principais_ao_alcance", () => {
    render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )

    const dock = screen.getByRole("navigation", { name: "Navegação móvel" })
    expect(within(dock).getByRole("link", { name: "Painel" })).toHaveAttribute("href", "/painel")
    expect(within(dock).getByRole("link", { name: "Painel" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(within(dock).getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda")
    expect(within(dock).getByRole("button", { name: "Abrir Áreas" })).toHaveAttribute(
      "aria-controls",
      "mobile-navigation-drawer",
    )
  })

  it("test_menu_movel_da_acesso_a_todas_as_areas_e_retem_o_foco", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    const openButton = screen.getByRole("button", { name: "Abrir menu" })

    await user.click(openButton)

    const dialog = screen.getByRole("dialog", { name: "Life Under Control" })
    const areaNavigation = within(dialog).getByRole("navigation", { name: "Áreas móvel" })
    expect(within(areaNavigation).getAllByRole("link")).toHaveLength(6)
    expect(within(areaNavigation).getByRole("link", { name: "Finanças" })).toHaveAttribute(
      "href",
      "/areas/financas",
    )
    expect(within(dialog).getByRole("button", { name: "Fechar menu" })).toHaveFocus()
    expect(document.body).toHaveStyle({ overflow: "hidden" })

    await user.keyboard("{Escape}")

    expect(container.querySelector("div[data-open]")).toHaveAttribute("data-open", "false")
    expect(openButton).toHaveFocus()
    expect(document.body).not.toHaveStyle({ overflow: "hidden" })
  })
})
