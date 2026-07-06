// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { NovaContaButton } from "./NovaContaButton"

afterEach(cleanup)

describe("NovaContaButton", () => {
  it("test_botao_nova_conta_presente_com_destino_nova_1", () => {
    render(<NovaContaButton />)

    const link = screen.getByRole("link", { name: "Nova Conta" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "/areas/financas/pagamentos-recorrentes?nova=1")
  })
})
