// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { CenarioMes } from "@/core/use-cases/derive-cenario-mes"
import { CenarioPagamentosMes } from "./CenarioPagamentosMes"

afterEach(cleanup)

/** Cenário parcial de julho (3/5 quitadas, 2 pendentes com histórico) — base que cada teste muta. */
function cenario(over: Partial<CenarioMes> = {}): CenarioMes {
  return {
    competencia: "2026-07",
    hoje: "2026-07-09",
    fimDoMes: "2026-07-31",
    pago: 95000,
    quitadas: { quitadas: 3, total: 5 },
    pendentes: 2,
    faltaEstimada: { estado: "estimado", valor: 40000 },
    projecao: { estado: "estimada", valor: 135000 },
    comparativo: { estado: "comparado", mesAnterior: "2026-06", percentual: -20 },
    ...over,
  }
}

describe("CenarioPagamentosMes (Seam 2)", () => {
  it("test_pago_exato_progresso_e_fracao_de_quitadas", () => {
    render(<CenarioPagamentosMes cenario={cenario()} />)
    expect(screen.getByText("Pago até o dia 09")).toBeInTheDocument()
    expect(screen.getByText("R$ 950,00")).toBeInTheDocument()
    expect(screen.getByText("3/5 pagas")).toBeInTheDocument()
  })

  it("test_falta_estimada_com_prazo_e_projecao_com_queda", () => {
    render(<CenarioPagamentosMes cenario={cenario()} />)
    expect(screen.getByText("≈ R$ 400")).toBeInTheDocument()
    expect(screen.getByText("2 Contas até 31/07 · estimativa")).toBeInTheDocument()
    expect(screen.getByText("≈ R$ 1.350")).toBeInTheDocument()
    const delta = screen.getByText("−20,0% vs junho")
    expect(delta).toHaveAttribute("data-tone", "success")
  })

  it("test_projecao_em_alta_ganha_tom_de_alerta", () => {
    render(
      <CenarioPagamentosMes
        cenario={cenario({
          comparativo: { estado: "comparado", mesAnterior: "2026-06", percentual: 12.34 },
        })}
      />,
    )
    expect(screen.getByText("+12,3% vs junho")).toHaveAttribute("data-tone", "warn")
  })

  it("test_tudo_quitado_zero_e_projecao_exata_sem_til", () => {
    render(
      <CenarioPagamentosMes
        cenario={cenario({
          pago: 135000,
          quitadas: { quitadas: 5, total: 5 },
          pendentes: 0,
          faltaEstimada: { estado: "estimado", valor: 0 },
          projecao: { estado: "exata", valor: 135000 },
        })}
      />,
    )
    expect(screen.getByText("nenhuma Conta em aberto")).toBeInTheDocument()
    expect(screen.getByText("R$ 0,00")).toBeInTheDocument()
    // pago e projeção coincidem: tudo quitado, a projeção é exata (sem `≈`)
    expect(screen.getAllByText("R$ 1.350,00")).toHaveLength(2)
    expect(screen.queryByText("≈ R$ 1.350")).not.toBeInTheDocument()
  })

  it("test_sem_historico_nao_inventa_estimativa_nem_delta", () => {
    render(
      <CenarioPagamentosMes
        cenario={cenario({
          faltaEstimada: { estado: "sem-historico" },
          projecao: { estado: "sem-estimativa" },
          comparativo: { estado: "sem-base" },
        })}
      />,
    )
    expect(screen.getAllByText("—")).toHaveLength(2)
    expect(screen.getByText("sem histórico para estimar")).toBeInTheDocument()
    expect(screen.getByText("sem base anterior")).toBeInTheDocument()
  })
})
