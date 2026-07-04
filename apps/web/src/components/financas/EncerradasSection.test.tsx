// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Bill } from "@/core/domain/bill"

// next/navigation não tem router montado nos testes — mockamos o mínimo, com o
// estado do toggle controlado por mockReturnValue (a navegação em si é do Next).
const { useSearchParamsMock, replaceMock } = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(() => new URLSearchParams()),
  replaceMock: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useSearchParams: useSearchParamsMock,
  usePathname: () => "/areas/financas/pagamentos-recorrentes",
  useRouter: () => ({ replace: replaceMock }),
}))
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

import { EncerradasSection } from "./EncerradasSection"

afterEach(() => {
  cleanup()
  useSearchParamsMock.mockReturnValue(new URLSearchParams())
  replaceMock.mockClear()
})

const bill: Bill = {
  id: "bill-1",
  householdId: "house-1",
  nome: "Streaming cancelado",
  descricao: null,
  icon: "tv",
  recurrence: { intervalMonths: 1, anchorMonth: null },
  dueRule: { kind: "dia-fixo", day: 10 },
  dueMonthOffset: 0,
  primeiraCompetencia: "2020-01",
  estado: "encerrada",
  encerradaEm: "2026-05-20",
  logoKey: null,
}

describe("EncerradasSection (Seam #49)", () => {
  it("test_nada_de_bills_nao_renderiza_secao", () => {
    render(<EncerradasSection bills={[]} />)
    expect(screen.queryByRole("heading", { name: /encerradas/i })).not.toBeInTheDocument()
  })

  it("test_colapsada_por_default_nao_monta_as_contas_no_dom", () => {
    render(<EncerradasSection bills={[bill]} />)
    const toggle = screen.getByRole("button", { name: /mostrar/i })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Streaming cancelado")).not.toBeInTheDocument()
  })

  it("test_url_com_encerradas_1_renderiza_ja_expandida", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("encerradas=1"))
    render(<EncerradasSection bills={[bill]} />)

    const toggle = screen.getByRole("button", { name: /ocultar/i })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Streaming cancelado")).toBeVisible()
  })

  it("test_clicar_mostrar_grava_encerradas_1_na_url_via_router_replace", async () => {
    const user = userEvent.setup()
    render(<EncerradasSection bills={[bill]} />)

    await user.click(screen.getByRole("button", { name: /mostrar/i }))

    expect(replaceMock).toHaveBeenCalledWith(
      "/areas/financas/pagamentos-recorrentes?encerradas=1",
      { scroll: false },
    )
  })

  it("test_clicar_ocultar_remove_encerradas_da_url_via_router_replace", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("encerradas=1"))
    const user = userEvent.setup()
    render(<EncerradasSection bills={[bill]} />)

    await user.click(screen.getByRole("button", { name: /ocultar/i }))

    expect(replaceMock).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes", {
      scroll: false,
    })
  })
})
