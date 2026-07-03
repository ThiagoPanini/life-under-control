// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SectionHeading } from "./SectionHeading"

afterEach(cleanup)

describe("SectionHeading (Seam #49)", () => {
  it("test_titulo_vira_heading_h2_semantico", () => {
    render(<SectionHeading title="Panorama" />)
    expect(screen.getByRole("heading", { level: 2, name: "Panorama" })).toBeInTheDocument()
  })

  it("test_sufixo_e_subtitulo_aparecem_junto_do_titulo", () => {
    render(
      <SectionHeading
        title="Contas ativas"
        suffix="· 3"
        subtitle="Estado de cada Conta neste mês"
      />,
    )
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Contas ativas · 3")
    expect(screen.getByText("Estado de cada Conta neste mês")).toBeInTheDocument()
  })

  it("test_slot_de_acoes_renderiza_ao_lado_do_titulo", () => {
    render(<SectionHeading title="Encerradas" actions={<button type="button">Mostrar</button>} />)
    expect(screen.getByRole("button", { name: "Mostrar" })).toBeInTheDocument()
  })

  it("test_variante_destaque_com_icone_amplia_titulo_e_renderiza_icone", () => {
    render(
      <SectionHeading
        title="Análise do mês vigente"
        variant="destaque"
        icon={<span data-testid="chip-icone">📅</span>}
      />,
    )
    const heading = screen.getByRole("heading", { level: 2, name: "Análise do mês vigente" })
    expect(heading).toHaveClass("text-[17px]", "font-extrabold")
    expect(screen.getByTestId("chip-icone")).toBeInTheDocument()
  })
})
