// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { PontoTotalPagoMes, SerieHistorica } from "@/core/use-cases/derive-analise-historica"
import { TotalPagoPorMes } from "./TotalPagoPorMes"

afterEach(cleanup)

function ponto(over: Partial<PontoTotalPagoMes> = {}): PontoTotalPagoMes {
  return { competencia: "2026-04", valor: 4000, estado: "fechado", ...over }
}

function comDados(pontos: PontoTotalPagoMes[]): SerieHistorica {
  return { estado: "com-dados", pontos }
}

describe("TotalPagoPorMes (Seam 2)", () => {
  it("test_renderiza_secao_com_titulo_da_analise_historica", () => {
    render(<TotalPagoPorMes serie={comDados([ponto()])} />)
    expect(screen.getByText("Análise Histórica")).toBeInTheDocument()
  })

  it("test_tabela_sr_only_traz_a_serie_inteira_com_competencia_valor_estado", () => {
    render(
      <TotalPagoPorMes
        serie={comDados([
          ponto({ competencia: "2026-04", valor: 4000, estado: "fechado" }),
          ponto({ competencia: "2026-05", valor: 0, estado: "sem-dado" }),
          ponto({ competencia: "2026-06", valor: 7000, estado: "em-curso" }),
        ])}
      />,
    )
    const linhas = screen.getAllByRole("row")
    // 1 cabeçalho + 3 competências
    expect(linhas).toHaveLength(4)
    const abr = within(screen.getByText("abr/26").closest("tr") as HTMLElement)
    expect(abr.getByText("R$ 40,00")).toBeInTheDocument()
  })

  it("test_mes_sem_dado_nao_mostra_zero_silencioso_na_tabela", () => {
    render(
      <TotalPagoPorMes
        serie={comDados([ponto({ competencia: "2026-05", valor: 0, estado: "sem-dado" })])}
      />,
    )
    const linha = within(screen.getByText("mai/26").closest("tr") as HTMLElement)
    expect(linha.getByText("sem dado")).toBeInTheDocument()
    expect(linha.queryByText("R$ 0,00")).not.toBeInTheDocument()
  })

  it("test_mes_corrente_e_identificado_como_parcial_por_traco_e_texto", () => {
    render(
      <TotalPagoPorMes
        serie={comDados([ponto({ competencia: "2026-06", valor: 7000, estado: "em-curso" })])}
      />,
    )
    // texto, não só cor
    expect(screen.getByText("(em curso)")).toBeInTheDocument()
    const barra = screen.getByTestId("total-pago-ponto")
    expect(barra).toHaveAttribute("data-estado", "em-curso")
    expect(barra).toHaveAttribute("aria-label", expect.stringContaining("em curso"))
  })

  it("test_mes_fechado_e_solido", () => {
    render(
      <TotalPagoPorMes
        serie={comDados([ponto({ competencia: "2026-04", valor: 4000, estado: "fechado" })])}
      />,
    )
    expect(screen.getByTestId("total-pago-ponto")).toHaveAttribute("data-estado", "fechado")
  })

  it("test_hover_em_outra_barra_nao_apaga_tooltip_de_quem_tem_foco", () => {
    render(
      <TotalPagoPorMes
        serie={comDados([
          ponto({ competencia: "2026-03", valor: 3000, estado: "fechado" }),
          ponto({ competencia: "2026-04", valor: 4000, estado: "fechado" }),
        ])}
      />,
    )
    const [marco, abril] = screen.getAllByTestId("total-pago-ponto")
    fireEvent.focus(marco)
    expect(screen.getByRole("tooltip")).toHaveTextContent("mar/26")
    fireEvent.mouseEnter(abril)
    // foco vence o hover: o tooltip continua no mês focado
    expect(screen.getByRole("tooltip")).toHaveTextContent("mar/26")
  })

  it("test_estado_vazio_explica_a_limitacao_sem_esconder_a_secao", () => {
    render(<TotalPagoPorMes serie={{ estado: "sem-fatos" }} />)
    // a seção continua visível (título presente) e há mensagem honesta
    expect(screen.getByText("Análise Histórica")).toBeInTheDocument()
    expect(screen.getByText(/sem lançamentos/i)).toBeInTheDocument()
  })

  it("test_mes_corrente_sem_lancamento_nao_mostra_zero_silencioso", () => {
    // Início do mês corrente, ainda sem baixa: em-curso com valor 0 não pode
    // virar "R$ 0,00" — ausência ≠ zero (CONTEXT.md #3).
    render(
      <TotalPagoPorMes
        serie={comDados([ponto({ competencia: "2026-06", valor: 0, estado: "em-curso" })])}
      />,
    )
    const linha = within(screen.getByText("jun/26").closest("tr") as HTMLElement)
    expect(linha.getByText("sem dado")).toBeInTheDocument()
    expect(linha.queryByText("R$ 0,00")).not.toBeInTheDocument()
    // traço + texto: o mês segue marcado como em curso, sem cifra
    expect(screen.getByText("(em curso)")).toBeInTheDocument()
    expect(screen.getByTestId("total-pago-ponto")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("sem lançamento"),
    )
  })

  it("test_grafico_nao_e_imagem_opaca_e_pontos_seguem_focaveis", () => {
    // role="img" no <svg> colapsaria a subárvore e calaria os aria-label das
    // barras focáveis; sem esse role, os filhos rotulados seguem anunciáveis.
    render(<TotalPagoPorMes serie={comDados([ponto()])} />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    const barra = screen.getByTestId("total-pago-ponto")
    expect(barra).toHaveAttribute("tabindex", "0")
    expect(barra).toHaveAttribute("aria-label", expect.stringContaining("abr/26"))
  })
})
