// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { PontoBarraCompetencia } from "@/core/use-cases/derive-barras-competencia"
import { BarrasCompetencia } from "./BarrasCompetencia"

/** Seam 2 (borda) leve: bars nascem focáveis com estado/valor acessível — sem simular hover/foco. */
afterEach(cleanup)

const pontos: PontoBarraCompetencia[] = [
  { competencia: "2026-04", valor: 5000, estado: "fechado" },
  { competencia: "2026-05", valor: 0, estado: "lacuna" },
  { competencia: "2026-06", valor: 3000, estado: "em-curso" },
]

describe("BarrasCompetencia (Seam 2)", () => {
  it("test_uma_barra_por_ponto_com_estado_e_valor_acessiveis", () => {
    render(
      <BarrasCompetencia titulo="Total pago por competência" pontos={pontos} mediaMensal={4000} />,
    )
    const barras = screen.getAllByTestId("barra-competencia")
    expect(barras).toHaveLength(3)
    expect(barras[0]).toHaveAttribute("data-estado", "fechado")
    expect(barras[0]).toHaveAttribute("aria-label", expect.stringContaining("R$ 50,00"))
    expect(barras[1]).toHaveAttribute("data-estado", "lacuna")
    expect(barras[1]).toHaveAttribute("aria-label", expect.stringContaining("sem dado"))
    expect(barras[2]).toHaveAttribute("data-estado", "em-curso")
    expect(barras[2]).toHaveAttribute("aria-label", expect.stringContaining("em curso"))
  })

  it("test_barras_sao_focaveis_por_teclado", () => {
    render(
      <BarrasCompetencia titulo="Total pago por competência" pontos={pontos} mediaMensal={null} />,
    )
    for (const barra of screen.getAllByTestId("barra-competencia")) {
      expect(barra).toHaveAttribute("tabindex", "0")
    }
  })

  it("test_media_12m_aparece_com_label_mono", () => {
    render(
      <BarrasCompetencia titulo="Total pago por competência" pontos={pontos} mediaMensal={4000} />,
    )
    expect(screen.getByText(/média 12m/)).toBeInTheDocument()
  })

  it("test_delta_so_aparece_no_cabecalho_nunca_por_barra", () => {
    render(
      <BarrasCompetencia
        titulo="Total pago por competência"
        pontos={pontos}
        mediaMensal={null}
        deltaTexto="−2,1% vs. mês anterior"
      />,
    )
    expect(screen.getByText("−2,1% vs. mês anterior")).toBeInTheDocument()
    const emCurso = screen.getAllByTestId("barra-competencia")[2]
    expect(emCurso.getAttribute("aria-label")).not.toContain("vs.")
  })

  it("test_resumo_textual_equivalente_existe_para_leitor_de_tela", () => {
    render(
      <BarrasCompetencia titulo="Total pago por competência" pontos={pontos} mediaMensal={null} />,
    )
    expect(screen.getByText("sem dado")).toBeInTheDocument() // dentro da tabela sr-only
  })

  it("test_sem_pontos_mostra_mensagem_em_vez_de_grafico_vazio", () => {
    render(<BarrasCompetencia titulo="Total pago por competência" pontos={[]} mediaMensal={null} />)
    expect(screen.getByText(/sem histórico/i)).toBeInTheDocument()
    expect(screen.queryByTestId("barra-competencia")).not.toBeInTheDocument()
  })
})
