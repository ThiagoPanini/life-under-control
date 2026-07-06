// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NovaContaModal } from "./NovaContaModal"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  criarConta: vi.fn(async () => ({ erros: [] })),
  prepararLogoConta: vi.fn(),
  confirmarLogoConta: vi.fn(),
  removerLogoConta: vi.fn(),
}))

afterEach(cleanup)

describe("NovaContaModal", () => {
  it("test_usa_a_mesma_casca_narrow_da_edicao", () => {
    render(<NovaContaModal closeHref="/contas" />)

    expect(screen.getByRole("dialog", { name: "Nova Conta" })).toHaveClass("max-w-[400px]")
    expect(screen.getByText("Finanças · Pagamentos Recorrentes")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Identidade" })).toBeInTheDocument()
  })
})
