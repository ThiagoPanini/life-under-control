// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// next/navigation e next/link não têm router montado nos testes — mockamos o mínimo.
vi.mock("next/navigation", () => ({ usePathname: () => "/painel" }))
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
  it("test_area_em_breve_mostra_selo_muted_e_link_correto", () => {
    render(
      <AreaCard
        area={{ slug: "financas", nome: "Finanças", icon: "wallet", estado: "em-breve" }}
      />,
    )

    const selo = screen.getByText("em breve")
    expect(selo).toBeInTheDocument()
    expect(selo).toHaveAttribute("data-tone", "muted")
    expect(screen.getByText("Finanças").closest("a")).toHaveAttribute("href", "/areas/financas")
  })
})

describe("AppShell sidebar (Seam 3)", () => {
  it("test_colapso_persiste_no_localStorage", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )
    const aside = container.querySelector("aside")
    expect(aside).toHaveAttribute("data-collapsed", "false")

    await user.click(screen.getByRole("button", { name: "Recolher menu" }))

    expect(localStorage.getItem("luc:sidebar-collapsed")).toBe("true")
    expect(aside).toHaveAttribute("data-collapsed", "true")
  })

  it("test_estado_colapsado_sobrevive_a_remontagem", async () => {
    localStorage.setItem("luc:sidebar-collapsed", "true")

    const { container } = render(
      <AppShell>
        <div>conteúdo</div>
      </AppShell>,
    )

    await waitFor(() => {
      expect(container.querySelector("aside")).toHaveAttribute("data-collapsed", "true")
    })
  })
})
