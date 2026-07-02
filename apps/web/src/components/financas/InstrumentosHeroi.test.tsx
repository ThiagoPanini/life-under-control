// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Pontualidade12m } from "@/core/use-cases/derive-pontualidade"
import { InstrumentosHeroi } from "./InstrumentosHeroi"

afterEach(cleanup)

function mockMatchMedia(reduzida: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduzida,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const pontualidadeCalculada: Pontualidade12m = { estado: "calculada", percentual: 87 }

describe("InstrumentosHeroi (Seam 2)", () => {
  it("test_com_reduced_motion_mostra_valor_final_sem_animar", () => {
    mockMatchMedia(true)
    render(
      <InstrumentosHeroi
        competencia="2026-07"
        faltaPagar={{ estado: "estimado", valor: 45000 }}
        pedemAtencaoAgora={{ estado: "sem-historico" }}
        totalPagoMes={95000}
        gastoMensalMedio={120000}
        pontualidade={pontualidadeCalculada}
      />,
    )
    expect(screen.getByText("Falta pagar · julho")).toBeInTheDocument()
    expect(screen.getByText("R$ 450,00")).toBeInTheDocument()
  })

  it("test_sem_reduced_motion_comeca_a_contagem_do_zero", () => {
    mockMatchMedia(false)
    render(
      <InstrumentosHeroi
        competencia="2026-07"
        faltaPagar={{ estado: "estimado", valor: 45000 }}
        pedemAtencaoAgora={{ estado: "sem-historico" }}
        totalPagoMes={95000}
        gastoMensalMedio={120000}
        pontualidade={pontualidadeCalculada}
      />,
    )
    // logo após montar (antes do 1º frame do requestAnimationFrame), a contagem começa em zero
    expect(screen.getByText("R$ 0,00")).toBeInTheDocument()
  })

  it("test_linha_pedem_atencao_agora_so_aparece_com_valor", () => {
    mockMatchMedia(true)
    render(
      <InstrumentosHeroi
        competencia="2026-07"
        faltaPagar={{ estado: "estimado", valor: 45000 }}
        pedemAtencaoAgora={{ estado: "estimado", valor: 12000 }}
        totalPagoMes={95000}
        gastoMensalMedio={120000}
        pontualidade={pontualidadeCalculada}
      />,
    )
    expect(screen.getByText("~R$ 120,00 pedem atenção agora")).toBeInTheDocument()
  })

  it("test_tres_metricas_e_pontualidade_sem_historico_mostra_travessao", () => {
    mockMatchMedia(true)
    render(
      <InstrumentosHeroi
        competencia="2026-07"
        faltaPagar={{ estado: "sem-historico" }}
        pedemAtencaoAgora={{ estado: "sem-historico" }}
        totalPagoMes={95000}
        gastoMensalMedio={null}
        pontualidade={{ estado: "sem-historico" }}
      />,
    )
    expect(screen.getByText("R$ 950,00")).toBeInTheDocument() // Total pago · mês
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2) // falta pagar + gasto médio + pontualidade
    expect(
      screen.getByText("estimativa do histórico — o exato nasce no Lançamento"),
    ).toBeInTheDocument()
  })
})
