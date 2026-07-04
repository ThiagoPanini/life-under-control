// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// next/navigation e next/link não têm router montado nos testes — mockamos o mínimo.
const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/painel") }))
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }))
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
// next/image detecta "carregada" via naturalWidth, sempre 0 no jsdom — mockamos
// pro <img> nativo (mesmo raciocínio do PersonAvatar.test.tsx).
vi.mock("next/image", () => ({
  default: (props: ComponentProps<"img">) => (
    // biome-ignore lint/a11y/useAltText: alt vem de `props` no teste
    // biome-ignore lint/performance/noImgElement: mock de next/image no teste
    <img {...props} />
  ),
}))

import { AreaCard } from "@/components/ds/AreaCard"
import { AppShell, type ShellPessoa } from "./AppShell"

afterEach(() => {
  cleanup()
  localStorage.clear()
  usePathnameMock.mockReturnValue("/painel")
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

  it("test_href_customizado_reusa_o_card_para_um_assunto", () => {
    render(
      <AreaCard
        area={{
          slug: "pagamentos-recorrentes",
          nome: "Pagamentos Recorrentes",
          icon: "wallet",
          estado: "ativa",
        }}
        href="/areas/financas/pagamentos-recorrentes"
      />,
    )

    expect(screen.getByText("Pagamentos Recorrentes").closest("a")).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes",
    )
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

  it("test_usuario_com_avatarurl_mostra_foto_e_nome_no_rodape_da_sidebar", () => {
    const usuario: ShellPessoa = {
      id: "u-1",
      nome: "Thiago",
      inicial: "T",
      avatarUrl: "https://conta.r2.cloudflarestorage.com/t.jpg",
    }
    render(
      <AppShell usuario={usuario}>
        <div>conteúdo</div>
      </AppShell>,
    )

    expect(screen.getByAltText("Thiago")).toBeInTheDocument()
    expect(screen.getByText("Thiago")).toBeInTheDocument()
    expect(screen.getByText("Conta Google")).toBeInTheDocument()
    expect(screen.queryByText("Jakeline")).toBeNull()
    expect(screen.queryByText(/acesso simétrico/)).toBeNull()
  })

  it("test_sem_usuario_a_casca_ainda_mostra_fallback_no_rodape", () => {
    render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )

    const badge = screen.getByLabelText("Usuário")
    expect(badge).toBeInTheDocument()
    expect(badge).not.toHaveStyle({ color: "var(--luc-thiago-fg)" })
  })

  it("test_navegacao_principal_nao_lista_mais_financas", () => {
    render(<AppShell>conteúdo</AppShell>)
    const principal = screen.getByRole("navigation", { name: "Principal" })

    expect(within(principal).queryByRole("link", { name: "Finanças" })).toBeNull()
    expect(within(principal).getAllByRole("link")).toHaveLength(2)
  })

  it("test_area_com_assuntos_e_toggle_que_expande_e_colapsa_sem_navegar", async () => {
    const user = userEvent.setup()
    render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const toggle = within(areas).getByRole("button", { name: "Finanças" })

    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(within(areas).queryByRole("link", { name: "Pagamentos Recorrentes" })).toBeNull()

    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(within(areas).getByRole("link", { name: "Pagamentos Recorrentes" })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes",
    )

    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("test_area_da_rota_atual_vem_auto_expandida", () => {
    usePathnameMock.mockReturnValue("/areas/financas/pagamentos-recorrentes")
    render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })

    expect(within(areas).getByRole("button", { name: "Finanças" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(within(areas).getByRole("link", { name: "Pagamentos Recorrentes" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  it("test_toggle_manual_da_area_grava_preferencia_local", async () => {
    const user = userEvent.setup()
    render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })

    await user.click(within(areas).getByRole("button", { name: "Finanças" }))

    expect(JSON.parse(localStorage.getItem("luc:sidebar-expanded") ?? "[]")).toContain("financas")
  })

  it("test_colapso_manual_da_area_ativa_sobrevive_a_recarga", async () => {
    const user = userEvent.setup()
    usePathnameMock.mockReturnValue("/areas/financas/pagamentos-recorrentes")
    const { unmount } = render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const toggle = within(areas).getByRole("button", { name: "Finanças" })
    expect(toggle).toHaveAttribute("aria-expanded", "true")

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    unmount()

    render(<AppShell>conteúdo</AppShell>)
    const areasDepoisDoReload = screen.getByRole("navigation", { name: "Áreas" })
    expect(within(areasDepoisDoReload).getByRole("button", { name: "Finanças" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })

  it("test_preferencia_local_corrompida_nao_quebra_a_sidebar", () => {
    localStorage.setItem("luc:sidebar-expanded", "{ isso não é json")

    expect(() => render(<AppShell>conteúdo</AppShell>)).not.toThrow()
  })

  it("test_area_em_breve_ativa_ganha_destaque_visual_na_rota_atual", () => {
    usePathnameMock.mockReturnValue("/areas/saude")
    render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const saude = within(areas).getByText("Saúde").closest("[aria-disabled]")

    expect(saude).toHaveAttribute("aria-current", "page")
  })

  it("test_area_em_breve_sem_assuntos_fica_inerte", () => {
    render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const saude = within(areas).getByText("Saúde").closest("[aria-disabled]")

    expect(saude).toHaveAttribute("aria-disabled", "true")
    expect(within(areas).queryByRole("button", { name: "Saúde" })).toBeNull()
    expect(within(areas).queryByRole("link", { name: "Saúde" })).toBeNull()
  })

  it("test_assunto_em_breve_nao_aparece_na_sidebar_expandida", async () => {
    const user = userEvent.setup()
    render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })

    await user.click(within(areas).getByRole("button", { name: "Finanças" }))

    expect(within(areas).queryByText("Investimentos")).toBeNull()
  })

  it("test_label_controle_e_divisor_precedem_o_grupo_areas", () => {
    const { container } = render(<AppShell>conteúdo</AppShell>)
    const aside = container.querySelector("aside") as HTMLElement

    expect(within(aside).getByText("Controle")).toBeInTheDocument()
    expect(within(aside).getByText("Áreas")).toBeInTheDocument()
  })

  it("test_com_assunto_ativo_so_o_leaf_destaca_grupo_fica_neutro", () => {
    usePathnameMock.mockReturnValue("/areas/financas/pagamentos-recorrentes")
    render(<AppShell>conteúdo</AppShell>)
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const grupo = within(areas).getByRole("button", { name: "Finanças" })
    const leaf = within(areas).getByRole("link", { name: "Pagamentos Recorrentes" })

    expect(grupo).not.toHaveClass("bg-luc-accent-12")
    expect(leaf).toHaveClass("bg-luc-accent-12")
  })

  it("test_command_palette_abre_pelo_atalho_e_lista_apenas_assuntos_ativos", async () => {
    const user = userEvent.setup()
    render(<AppShell>conteúdo</AppShell>)

    await user.keyboard("{Control>}k{/Control}")

    const dialog = screen.getByRole("dialog", { name: "Ir para…" })
    expect(within(dialog).getByRole("link", { name: /Painel/ })).toHaveAttribute("href", "/painel")
    expect(within(dialog).getByRole("link", { name: /Pagamentos Recorrentes/ })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes",
    )
    expect(within(dialog).getByRole("link", { name: /Agenda/ })).toHaveAttribute("href", "/agenda")
    expect(within(dialog).queryByRole("link", { name: /Saúde/ })).toBeNull()
  })

  it("test_header_mostra_breadcrumb_e_nao_tem_busca_visivel_nem_badges", () => {
    usePathnameMock.mockReturnValue("/areas/financas/pagamentos-recorrentes")
    const { container } = render(<AppShell>conteúdo</AppShell>)
    const desktopHeader = container.querySelectorAll("header")[1] as HTMLElement

    // Breadcrumb hierárquico (#95): Área muted, separador disabled, Assunto forte.
    const financas = within(desktopHeader).getByText("Finanças")
    expect(financas).toHaveClass("text-luc-muted")
    expect(within(desktopHeader).getByText("›")).toHaveClass("text-luc-disabled")
    const assunto = within(desktopHeader).getByText("Pagamentos Recorrentes")
    expect(assunto).toHaveClass("font-bold")
    expect(assunto).toHaveClass("text-luc-text")
    expect(screen.queryByRole("button", { name: "Buscar" })).toBeNull()
    expect(screen.queryByText("⌘K")).toBeNull()
    expect(screen.queryByLabelText("Thiago")).toBeNull()
    expect(screen.queryByLabelText("Jakeline")).toBeNull()
  })

  it("test_atalho_de_comando_continua_funcionando_sem_botao_visivel", async () => {
    const user = userEvent.setup()
    render(<AppShell>conteúdo</AppShell>)

    await user.keyboard("{Control>}k{/Control}")

    expect(screen.getByRole("dialog", { name: "Ir para…" })).toBeInTheDocument()
  })
})

describe("AppShell sidebar colapsada — flyout de Assuntos (issue #52)", () => {
  function renderColapsada() {
    localStorage.setItem("luc:sidebar-collapsed", "1")
    return render(<AppShell>conteúdo</AppShell>)
  }

  it("test_area_com_assuntos_colapsada_e_botao_sem_href_em_vez_de_link", () => {
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })

    expect(within(areas).getByRole("button", { name: "Finanças" })).toBeInTheDocument()
    expect(within(areas).queryByRole("link", { name: "Finanças" })).toBeNull()
  })

  it("test_area_sem_assuntos_colapsada_continua_link_direto_como_hoje", () => {
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })

    expect(within(areas).getByRole("link", { name: "Saúde" })).toHaveAttribute(
      "href",
      "/areas/saude",
    )
  })

  it("test_hover_no_icone_abre_flyout_com_nome_da_area_e_assuntos", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    await user.hover(trigger)

    const flyout = within(areas).getByRole("navigation", { name: "Assuntos de Finanças" })
    expect(within(flyout).getByRole("link", { name: "Pagamentos Recorrentes" })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes",
    )
    expect(trigger).toHaveAttribute("aria-expanded", "true")
  })

  it("test_foco_no_icone_abre_flyout", () => {
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    fireEvent.focusIn(trigger)

    expect(trigger).toHaveAttribute("aria-expanded", "true")
  })

  it("test_clique_no_icone_abre_flyout_sem_navegar", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    expect(trigger.tagName).toBe("BUTTON")
    expect(trigger).not.toHaveAttribute("href")

    await user.click(trigger)

    expect(trigger).toHaveAttribute("aria-expanded", "true")
  })

  it("test_escape_fecha_flyout_e_devolve_foco_ao_gatilho", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    await user.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")

    await user.keyboard("{Escape}")

    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger).toHaveFocus()
  })

  it("test_foco_fora_do_flyout_fecha", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })
    const fora = screen.getByRole("link", { name: "Life Under Control" })

    await user.click(trigger)
    await user.tab()
    expect(trigger).toHaveAttribute("aria-expanded", "true")

    await user.click(fora)

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"))
  })

  it("test_mouse_sai_do_gatilho_mas_foco_permanece_no_flyout_nao_fecha", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    await user.click(trigger)
    trigger.focus()
    await user.keyboard("{ArrowDown}")
    const link = within(areas).getByRole("link", { name: "Pagamentos Recorrentes" })
    expect(link).toHaveFocus()

    fireEvent.mouseLeave(trigger.parentElement as HTMLElement)

    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(link).toHaveFocus()
  })

  it("test_escape_fecha_flyout_aberto_so_por_hover_mesmo_sem_foco_dentro", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    await user.hover(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")

    await user.keyboard("{Escape}")

    expect(trigger).toHaveAttribute("aria-expanded", "false")
  })

  it("test_area_ativa_expandivel_expoe_aria_current_no_gatilho_colapsado", () => {
    usePathnameMock.mockReturnValue("/areas/financas/pagamentos-recorrentes")
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })

    expect(within(areas).getByRole("button", { name: "Finanças" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  it("test_gatilho_do_rail_neutraliza_quando_flyout_abre_com_assunto_ativo", async () => {
    const user = userEvent.setup()
    usePathnameMock.mockReturnValue("/areas/financas/pagamentos-recorrentes")
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    expect(trigger).toHaveClass("bg-luc-accent-12")

    await user.click(trigger)

    expect(trigger).not.toHaveClass("bg-luc-accent-12")
    expect(within(areas).getByRole("link", { name: "Pagamentos Recorrentes" })).toHaveClass(
      "bg-luc-accent-12",
    )
  })

  it("test_aria_controls_do_gatilho_so_existe_com_flyout_aberto", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    expect(trigger).not.toHaveAttribute("aria-controls")

    await user.click(trigger)

    expect(trigger).toHaveAttribute("aria-controls", expect.stringContaining("area-flyout-"))
  })

  it("test_seta_para_baixo_navega_pelos_assuntos_dentro_do_flyout", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    await user.click(trigger)
    trigger.focus()
    await user.keyboard("{ArrowDown}")

    expect(within(areas).getByRole("link", { name: "Pagamentos Recorrentes" })).toHaveFocus()
  })

  it("test_assunto_em_breve_nao_aparece_no_flyout", async () => {
    const user = userEvent.setup()
    renderColapsada()
    const areas = screen.getByRole("navigation", { name: "Áreas" })
    const trigger = within(areas).getByRole("button", { name: "Finanças" })

    await user.click(trigger)

    expect(within(areas).queryByText("Investimentos")).toBeNull()
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
    expect(within(areaNavigation).getByRole("button", { name: "Finanças" })).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Fechar menu" })).toHaveFocus()
    expect(document.body).toHaveStyle({ overflow: "hidden" })

    await user.keyboard("{Escape}")

    expect(container.querySelector("div[data-open]")).toHaveAttribute("data-open", "false")
    expect(openButton).toHaveFocus()
    expect(document.body).not.toHaveStyle({ overflow: "hidden" })
  })

  it("test_area_no_drawer_expande_assuntos_ao_tocar_sem_navegar", async () => {
    const user = userEvent.setup()
    render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    await user.click(screen.getByRole("button", { name: "Abrir menu" }))
    const areaNavigation = screen.getByRole("navigation", { name: "Áreas móvel" })
    const toggle = within(areaNavigation).getByRole("button", { name: "Finanças" })

    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(
      within(areaNavigation).queryByRole("link", { name: "Pagamentos Recorrentes" }),
    ).toBeNull()

    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(
      within(areaNavigation).getByRole("link", { name: "Pagamentos Recorrentes" }),
    ).toHaveAttribute("href", "/areas/financas/pagamentos-recorrentes")
  })

  it("test_assunto_ativo_no_drawer_navega_e_fecha_o_menu", async () => {
    const user = userEvent.setup()
    usePathnameMock.mockReturnValue("/areas/financas/pagamentos-recorrentes")
    const { container } = render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    await user.click(screen.getByRole("button", { name: "Abrir menu" }))
    const areaNavigation = screen.getByRole("navigation", { name: "Áreas móvel" })
    const link = within(areaNavigation).getByRole("link", { name: "Pagamentos Recorrentes" })
    expect(link).toHaveAttribute("aria-current", "page")

    await user.click(link)

    expect(container.querySelector("div[data-open]")).toHaveAttribute("data-open", "false")
  })

  it("test_area_em_breve_fica_inerte_e_assunto_em_breve_nao_aparece_no_drawer", async () => {
    const user = userEvent.setup()
    render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    await user.click(screen.getByRole("button", { name: "Abrir menu" }))
    const areaNavigation = screen.getByRole("navigation", { name: "Áreas móvel" })
    const saude = within(areaNavigation).getByText("Saúde").closest("[aria-disabled]")
    expect(saude).toHaveAttribute("aria-disabled", "true")
    expect(within(areaNavigation).queryByRole("button", { name: "Saúde" })).toBeNull()

    await user.click(within(areaNavigation).getByRole("button", { name: "Finanças" }))
    expect(within(areaNavigation).queryByText("Investimentos")).toBeNull()
  })

  it("test_alvos_de_toque_da_area_e_do_assunto_tem_pelo_menos_44px", async () => {
    const user = userEvent.setup()
    render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    await user.click(screen.getByRole("button", { name: "Abrir menu" }))
    const areaNavigation = screen.getByRole("navigation", { name: "Áreas móvel" })
    const toggle = within(areaNavigation).getByRole("button", { name: "Finanças" })
    expect(toggle).toHaveClass("min-h-11")

    await user.click(toggle)
    expect(
      within(areaNavigation).getByRole("link", { name: "Pagamentos Recorrentes" }),
    ).toHaveClass("min-h-11")
  })

  it("test_expansao_do_drawer_reusa_a_mesma_chave_persistida_do_desktop", async () => {
    localStorage.setItem("luc:sidebar-expanded", JSON.stringify(["financas"]))
    render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Abrir menu" }))
    const areaNavigation = screen.getByRole("navigation", { name: "Áreas móvel" })

    expect(within(areaNavigation).getByRole("button", { name: "Finanças" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })
})
