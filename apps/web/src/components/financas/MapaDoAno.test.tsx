// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { CelulaMapa, LinhaMapa, MapaDoAno as Mapa } from "@/core/use-cases/derive-mapa-ano"
import { MapaDoAno } from "./MapaDoAno"

afterEach(cleanup)

function cel(
  competencia: string,
  estado: CelulaMapa["estado"],
  valor: number | null = null,
  desvio: number | null = null,
): CelulaMapa {
  return { competencia, estado, valor, desvio }
}

function linha(over: Partial<LinhaMapa> = {}): LinhaMapa {
  return {
    billId: "b-1",
    nome: "Internet",
    icon: "wifi",
    estado: "ativa",
    media: 10000,
    celulas: [cel("2026-05", "na-media", 10000, 0), cel("2026-06", "acima", 12000, 2000)],
    ...over,
  }
}

function comContas(linhas: LinhaMapa[], competencias = ["2026-05", "2026-06"]): Mapa {
  return { estado: "com-contas", competencias, linhas }
}

describe("MapaDoAno (Seam 2)", () => {
  it("test_renderiza_secao_com_titulo", () => {
    render(<MapaDoAno mapa={comContas([linha()])} />)
    expect(screen.getByText("Mapa do Ano")).toBeInTheDocument()
  })

  it("test_sem_contas_mostra_mensagem_textual", () => {
    render(<MapaDoAno mapa={{ estado: "sem-contas" }} />)
    expect(screen.getByText(/Nenhuma Conta com vigência/i)).toBeInTheDocument()
  })

  it("test_cabecalhos_de_competencia_em_mes_ano", () => {
    render(<MapaDoAno mapa={comContas([linha()])} />)
    expect(screen.getByRole("columnheader", { name: "mai/26" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "jun/26" })).toBeInTheDocument()
  })

  it("test_linha_traz_nome_e_media_por_extenso", () => {
    render(<MapaDoAno mapa={comContas([linha({ media: 10000 })])} />)
    expect(screen.getByText("Internet")).toBeInTheDocument()
    expect(screen.getByText("média R$ 100,00")).toBeInTheDocument()
  })

  it("test_ausencia_de_media_e_encerrada_ditas_por_extenso", () => {
    // Histórico insuficiente: "sem média" explícito; Conta encerrada ganha o selo.
    render(
      <MapaDoAno
        mapa={comContas([
          linha({ media: null, estado: "encerrada", celulas: [cel("2026-06", "fora-vigencia")] }),
        ])}
      />,
    )
    expect(screen.getByText("sem média")).toBeInTheDocument()
    expect(screen.getByText("encerrada")).toBeInTheDocument()
  })

  it("test_celula_carrega_descricao_acessivel_com_valor_e_desvio", () => {
    render(<MapaDoAno mapa={comContas([linha()])} />)
    const acima = screen.getByLabelText(/junho de 2026 · acima da média/i)
    expect(acima).toHaveAttribute("data-estado", "acima")
    expect(acima.getAttribute("aria-label")).toContain("R$ 120,00")
    expect(acima.getAttribute("aria-label")).toContain("desvio +R$ 20,00")
  })

  it("test_foco_na_celula_atualiza_a_barra_de_detalhe", () => {
    render(<MapaDoAno mapa={comContas([linha()])} />)
    const detalhe = screen.getByRole("status")
    // Antes do foco: a dica genérica.
    expect(detalhe).toHaveTextContent(/Passe o cursor ou navegue/i)
    fireEvent.focus(screen.getByLabelText(/junho de 2026 · acima da média/i))
    expect(detalhe).toHaveTextContent("Internet · junho de 2026 · acima da média · R$ 120,00")
  })

  it("test_celulas_expõem_o_estado_derivado", () => {
    render(
      <MapaDoAno
        mapa={comContas([
          linha({
            celulas: [cel("2026-05", "fora-vigencia"), cel("2026-06", "vencida")],
          }),
        ])}
      />,
    )
    const estados = screen.getAllByTestId("mapa-celula").map((b) => b.getAttribute("data-estado"))
    expect(estados).toContain("fora-vigencia")
    expect(estados).toContain("vencida")
  })

  it("test_legenda_explica_os_estados_por_extenso", () => {
    render(<MapaDoAno mapa={comContas([linha()])} />)
    const legenda = screen.getByRole("list")
    expect(within(legenda).getByText("fora da vigência")).toBeInTheDocument()
    expect(within(legenda).getByText("vencida")).toBeInTheDocument()
    expect(within(legenda).getByText("sem ocorrência")).toBeInTheDocument()
  })

  it("test_matriz_tem_container_de_scroll_horizontal", () => {
    const { container } = render(<MapaDoAno mapa={comContas([linha()])} />)
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull()
  })
})
