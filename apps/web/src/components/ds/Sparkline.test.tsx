// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Sparkline } from "./Sparkline"

/** Seam 2 (borda) leve: só que o svg nasce com a linha e o ponto final — sem simular hover. */
afterEach(cleanup)

describe("Sparkline (Seam 2)", () => {
  it("test_renderiza_linha_e_ponto_final_com_valores", () => {
    const { container } = render(<Sparkline values={[100, 200, 150]} label="Total pago" />)
    expect(container.querySelector("svg")).toBeInTheDocument()
    expect(container.querySelector("path")).toBeInTheDocument()
    expect(container.querySelector("circle")).toBeInTheDocument()
  })

  it("test_sem_valores_nao_quebra_e_nao_desenha_ponto_final", () => {
    const { container } = render(<Sparkline values={[]} label="Total pago" />)
    expect(container.querySelector("svg")).toBeInTheDocument()
    expect(container.querySelector("circle")).not.toBeInTheDocument()
  })

  it("test_valores_todos_iguais_nao_gera_coordenadas_nan", () => {
    const { container } = render(<Sparkline values={[5000, 5000, 5000]} label="Total pago" />)
    const circle = container.querySelector("circle")
    expect(circle).toBeInTheDocument()
    expect(Number(circle?.getAttribute("cy"))).not.toBeNaN()
    expect(container.querySelector("path")?.getAttribute("d")).not.toMatch(/NaN/)
  })
})
