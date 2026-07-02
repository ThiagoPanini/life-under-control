// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { GridCelula } from "@/core/use-cases/derive-bill-card"
import { HistoriaConta } from "./HistoriaConta"

afterEach(cleanup)

function celula(over: Partial<GridCelula> = {}): GridCelula {
  return {
    competencia: "2026-06",
    vencimento: "2026-06-10",
    estado: "em-dia",
    valor: 15000,
    ...over,
  }
}

const grid: GridCelula[] = [
  celula({ competencia: "2026-01", vencimento: "2026-01-10", estado: "em-dia", valor: 10000 }),
  celula({
    competencia: "2026-02",
    vencimento: "2026-02-10",
    estado: "atraso-leve",
    valor: 10500,
  }),
  celula({ competencia: "2026-03", vencimento: "2026-03-10", estado: "atraso", valor: 9800 }),
  celula({
    competencia: "2026-04",
    vencimento: "2026-04-10",
    estado: "em-aberto",
    valor: null,
  }),
  celula({
    competencia: "2026-05",
    vencimento: "2026-05-10",
    estado: "aguardando",
    valor: null,
  }),
  celula({
    competencia: "2026-06",
    vencimento: "2026-06-10",
    estado: "pago-sem-data",
    valor: 11000,
  }),
]

describe("HistoriaConta (Seam 2)", () => {
  it("test_uma_barra_por_celula_com_estado_e_rotulo_acessivel", () => {
    render(<HistoriaConta grid={grid} />)
    const barras = screen.getAllByTestId("historia-conta-barra")
    expect(barras).toHaveLength(6)
    expect(barras[0]).toHaveAttribute("data-estado", "em-dia")
    expect(barras[0]).toHaveAttribute("aria-label", "jan/26 · R$ 100,00 · em dia")
    expect(barras[2]).toHaveAttribute("data-estado", "atraso")
    expect(barras[5]).toHaveAttribute("data-estado", "pago-sem-data")
  })

  it("test_competencia_sem_valor_vira_stub_com_rotulo_sem_lancamento", () => {
    render(<HistoriaConta grid={grid} />)
    const barras = screen.getAllByTestId("historia-conta-barra")
    expect(barras[3]).toHaveAttribute("data-estado", "em-aberto")
    expect(barras[3]).toHaveAttribute("aria-label", "abr/26 · sem Lançamento · em aberto")
    expect(barras[4]).toHaveAttribute("data-estado", "aguardando")
    expect(barras[4]).toHaveAttribute("aria-label", "mai/26 · sem Lançamento · aguardando")
  })

  it("test_barras_sao_focaveis_por_teclado", () => {
    render(<HistoriaConta grid={grid} />)
    for (const barra of screen.getAllByTestId("historia-conta-barra")) {
      expect(barra).toHaveAttribute("tabindex", "0")
    }
  })

  it("test_legenda_lista_os_seis_estados", () => {
    render(<HistoriaConta grid={grid} />)
    for (const label of [
      "em dia",
      "atraso leve",
      "atraso",
      "em aberto",
      "aguardando",
      "pago sem data",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("test_tooltip_aparece_no_hover_e_no_foco", () => {
    render(<HistoriaConta grid={grid} />)
    const barras = screen.getAllByTestId("historia-conta-barra")

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.mouseEnter(barras[0])
    expect(screen.getByRole("tooltip")).toHaveTextContent("jan/26 · R$ 100,00 · em dia")

    fireEvent.mouseLeave(barras[0])
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.focus(barras[1])
    expect(screen.getByRole("tooltip")).toHaveTextContent("fev/26 · R$ 105,00 · atraso leve")

    fireEvent.blur(barras[1])
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("test_sem_celulas_mostra_mensagem_em_vez_de_grafico_vazio", () => {
    render(<HistoriaConta grid={[]} />)
    expect(screen.getByText(/sem histórico/i)).toBeInTheDocument()
    expect(screen.queryByTestId("historia-conta-barra")).not.toBeInTheDocument()
  })
})
