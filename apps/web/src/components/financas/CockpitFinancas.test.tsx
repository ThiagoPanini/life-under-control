// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { AgregadosMes, SerieTotalPago } from "@/core/use-cases/derive-agregados-financas"
import { CockpitFinancas } from "./CockpitFinancas"

/**
 * Seam 2 (borda): a apresentação do cockpit. A lógica dos agregados é do núcleo
 * (Seam 1); aqui só que os números aparecem formatados e que "falta pagar" vem
 * claramente marcado como estimativa.
 */
afterEach(cleanup)

const base: AgregadosMes = {
  totalPagoMes: 10000,
  contasEmAberto: 2,
  gastoMensalMedio: 12000,
  estimativaFaltaPagar: 6000,
}

const serie: SerieTotalPago = {
  estado: "com-dados",
  pontos: [
    { competencia: "2026-02", valor: 8000, emCurso: false },
    { competencia: "2026-03", valor: 9000, emCurso: false },
    { competencia: "2026-04", valor: 11000, emCurso: false },
    { competencia: "2026-05", valor: 12000, emCurso: false },
    { competencia: "2026-06", valor: 10000, emCurso: true },
  ],
}

describe("CockpitFinancas (Seam 2)", () => {
  it("test_formata_os_quatro_agregados_em_brl", () => {
    render(<CockpitFinancas agregados={base} serie={serie} />)
    expect(screen.getByText("Pago no mês")).toBeInTheDocument()
    expect(screen.getAllByText("R$ 100,00").length).toBeGreaterThanOrEqual(1) // pago + tendência
    expect(screen.getByText("R$ 120,00")).toBeInTheDocument() // gasto médio
    expect(screen.getByText("R$ 60,00")).toBeInTheDocument() // falta pagar
    expect(screen.getByText("2")).toBeInTheDocument() // em aberto
  })

  it("test_falta_pagar_vem_rotulada_como_estimativa", () => {
    render(<CockpitFinancas agregados={base} serie={serie} />)
    // marcada como estimativa: a tag junto do rótulo + a nota explicativa
    expect(screen.getAllByText("estimativa").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Falta pagar").length).toBeGreaterThanOrEqual(1)
  })

  it("test_sem_historico_mostra_travessao_em_vez_de_valor", () => {
    render(
      <CockpitFinancas
        serie={serie}
        agregados={{
          totalPagoMes: 0,
          contasEmAberto: 0,
          gastoMensalMedio: null,
          estimativaFaltaPagar: null,
        }}
      />,
    )
    // gasto médio e falta pagar nulos → "—" (dois travessões)
    expect(screen.getAllByText("—")).toHaveLength(2)
    expect(screen.getByText("R$ 0,00")).toBeInTheDocument() // pago exato continua exato
  })
})
