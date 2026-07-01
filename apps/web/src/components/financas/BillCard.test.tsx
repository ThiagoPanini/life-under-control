// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { CardConta, GridEstado } from "@/core/use-cases/derive-bill-card"

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

import { BillCard } from "./BillCard"

afterEach(cleanup)

const bill: Bill = {
  id: "bill-1",
  householdId: "house-1",
  nome: "Condomínio",
  descricao: "Moradia",
  icon: "house",
  recurrence: { intervalMonths: 1, anchorMonth: null },
  dueRule: { kind: "dia-fixo", day: 10 },
  dueMonthOffset: 0,
  estado: "ativa",
  encerradaEm: null,
}

const estados: GridEstado[] = [
  "em-dia",
  "atraso-leve",
  "atraso",
  "em-aberto",
  "aguardando",
  "pago-sem-data",
]

const card: CardConta = {
  vencimentoVigente: "2026-07-10",
  farol: "amarelo",
  media: 123456,
  sparkline: Array.from({ length: 12 }, (_, index) =>
    index % 3 === 0 ? null : 100000 + index * 1000,
  ),
  grid: Array.from({ length: 12 }, (_, index) => ({
    competencia: `2025-${String(index + 1).padStart(2, "0")}`,
    vencimento: `2025-${String(index + 1).padStart(2, "0")}-10`,
    estado: estados[index % estados.length],
    valor: index % 3 === 0 ? null : 100000 + index * 1000,
  })),
}

describe("BillCard", () => {
  it("test_exibe_farol_vencimento_grid_media_e_sparkline_derivados", () => {
    render(<BillCard bill={bill} card={card} />)

    expect(screen.getByText("vence em até 3 dias")).toBeInTheDocument()
    expect(screen.getByText("Vence 10/07/2026")).toBeInTheDocument()
    expect(screen.getByText("R$ 1.234,56")).toBeInTheDocument()
    expect(screen.getAllByTestId("grid-cell")).toHaveLength(12)
    expect(screen.getByRole("img", { name: "Histórico de valores pagos" })).toBeInTheDocument()
  })

  it("test_em_aberto_e_buraco_distinto_e_textual", () => {
    render(<BillCard bill={bill} card={card} />)

    const open = screen
      .getAllByTestId("grid-cell")
      .find((cell) => cell.dataset.estado === "em-aberto")
    expect(open).toHaveAttribute("aria-label", expect.stringContaining("em aberto"))
    expect(open?.className).toContain("bg-transparent")
  })
})
