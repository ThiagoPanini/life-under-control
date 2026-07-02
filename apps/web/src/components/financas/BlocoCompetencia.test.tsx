// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { BlocoCompetencia } from "./BlocoCompetencia"

afterEach(cleanup)

describe("BlocoCompetencia (Seam 2)", () => {
  it("test_mes_por_extenso_progresso_e_quitadas", () => {
    render(
      <BlocoCompetencia
        competencia="2026-07"
        pago={95000}
        projetado={{ estado: "estimado", valor: 120000 }}
        quitadas={{ quitadas: 3, total: 5 }}
      />,
    )
    expect(screen.getByText("julho de 2026")).toBeInTheDocument()
    expect(
      screen.getByText("R$ 950,00 pagos de ~R$ 1.200,00 projetados · estimativa do histórico"),
    ).toBeInTheDocument()
    expect(screen.getByText("3/5 quitadas")).toBeInTheDocument()
  })

  it("test_sem_historico_nao_inventa_projecao", () => {
    render(
      <BlocoCompetencia
        competencia="2026-07"
        pago={0}
        projetado={{ estado: "sem-historico" }}
        quitadas={{ quitadas: 0, total: 2 }}
      />,
    )
    expect(
      screen.getByText("R$ 0,00 pagos · sem histórico para projetar o mês"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/projetados/)).not.toBeInTheDocument()
  })
})
