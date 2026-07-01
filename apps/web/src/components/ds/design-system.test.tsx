// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AreaCard } from "./AreaCard"
import { Button } from "./Button"
import { PersonChip } from "./PersonChip"
import { Pill } from "./Pill"

afterEach(cleanup)

describe("contrato dos componentes do design system", () => {
  it("oferece botão secundário e estado desabilitado visível", () => {
    render(
      <Button variant="secondary" disabled>
        Salvar
      </Button>,
    )

    const button = screen.getByRole("button", { name: "Salvar" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("data-variant", "secondary")
    expect(button.className).toContain("disabled:cursor-not-allowed")
  })

  it("encaminha atributos acessíveis quando o botão vira link", () => {
    render(
      <Button href="/painel" variant="ghost" aria-label="Voltar ao Painel">
        Voltar
      </Button>,
    )

    expect(screen.getByRole("link", { name: "Voltar ao Painel" })).toHaveAttribute(
      "href",
      "/painel",
    )
  })

  it.each([
    "success",
    "warn",
    "coming-soon",
  ] as const)("expõe o tom semântico %s em pílulas", (tone) => {
    render(<Pill tone={tone}>estado</Pill>)
    expect(screen.getByText("estado")).toHaveAttribute("data-tone", tone)
  })

  it("usa os tokens nominais da Pessoa em vez de recalcular a cor", () => {
    render(
      <PersonChip
        pessoa={{
          id: "pessoa-1",
          nome: "Thiago",
          email: "thiago@example.com",
          inicial: "T",
          hue: 211,
        }}
        compact
      />,
    )

    const initial = screen.getByLabelText("Thiago")
    expect(initial.style.color).toBe("var(--luc-thiago-fg)")
    expect(initial.style.backgroundColor).toBe("var(--luc-thiago-bg)")
  })

  it("mostra métrica real apenas na Área ativa", () => {
    const { rerender } = render(
      <AreaCard
        area={{ slug: "financas", nome: "Finanças", icon: "wallet", estado: "ativa" }}
        metric="R$ 1.234,56 · julho"
      />,
    )

    expect(screen.getByText("R$ 1.234,56 · julho")).toBeInTheDocument()
    expect(screen.getByText("ativa")).toHaveAttribute("data-tone", "success")

    rerender(
      <AreaCard
        area={{ slug: "saude", nome: "Saúde", icon: "heart", estado: "em-breve" }}
        summary="Consultas, exames e métricas"
      />,
    )

    expect(screen.getByText("Consultas, exames e métricas")).toBeInTheDocument()
    expect(screen.getByText("em breve")).toHaveAttribute("data-tone", "coming-soon")
  })
})
