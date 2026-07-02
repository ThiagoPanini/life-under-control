// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FormaCompetencia } from "@/core/use-cases/derive-forma-competencia"
import type { Pontualidade12m } from "@/core/use-cases/derive-pontualidade"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: true, // reduced-motion nos testes: sem animação a esperar
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
)

import { CockpitFinancas } from "./CockpitFinancas"

/**
 * Seam 2 (borda): a composição do cockpit — Bloco Competência + Pista +
 * pendências anteriores + Instrumentos herói+3. A lógica de cada agregado é
 * do núcleo (#61/#58); aqui só que a `FormaCompetencia` chega e aparece.
 */
afterEach(cleanup)

const forma: FormaCompetencia = {
  projetado: { estado: "estimado", valor: 120000 },
  pago: 95000,
  faltaPagar: { estado: "estimado", valor: 25000 },
  quitadas: { quitadas: 3, total: 5 },
  marcadores: [
    {
      dia: "2026-07-10",
      competencia: "2026-07",
      contaId: "luz",
      titulo: "Luz",
      estado: "a-vencer",
      valorEsperado: 9000,
    },
  ],
  pendenciasAnteriores: [
    { contaId: "internet", titulo: "Internet", competencia: "2026-06", vencimento: "2026-06-05" },
  ],
}

const pontualidade: Pontualidade12m = { estado: "calculada", percentual: 87 }

describe("CockpitFinancas (Seam 2)", () => {
  it("test_compoe_bloco_competencia_pista_pendencias_e_instrumentos", () => {
    render(
      <CockpitFinancas
        competencia="2026-07"
        hoje="2026-07-12"
        forma={forma}
        gastoMensalMedio={80000}
        pontualidade={pontualidade}
      />,
    )

    // Bloco Competência
    expect(screen.getByText("julho de 2026")).toBeInTheDocument()
    expect(screen.getByText("3/5 quitadas")).toBeInTheDocument()

    // Pendências anteriores
    expect(screen.getByText("◂ junho: Internet em aberto")).toBeInTheDocument()

    // Instrumentos herói+3
    expect(screen.getByText("Falta pagar · julho")).toBeInTheDocument()
    expect(screen.getByText("R$ 250,00")).toBeInTheDocument()
    expect(screen.getByText("~R$ 90,00 pedem atenção agora")).toBeInTheDocument()
    expect(screen.getByText("R$ 950,00")).toBeInTheDocument() // total pago · mês = forma.pago
    expect(screen.getByText("R$ 800,00")).toBeInTheDocument() // gasto médio · 12m
    expect(screen.getByText("87%")).toBeInTheDocument() // pontualidade · 12m
  })
})
