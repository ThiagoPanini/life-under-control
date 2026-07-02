// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PendenciaAnterior } from "@/core/use-cases/derive-forma-competencia"

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

import { PendenciasAnterioresChip } from "./PendenciasAnterioresChip"

afterEach(cleanup)

describe("PendenciasAnterioresChip (Seam 2)", () => {
  it("test_sem_pendencias_nao_renderiza_nada", () => {
    render(<PendenciasAnterioresChip pendencias={[]} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("test_uma_pendencia_resume_conta_e_mes", () => {
    const pendencias: PendenciaAnterior[] = [
      { contaId: "internet", titulo: "Internet", competencia: "2026-06", vencimento: "2026-06-05" },
    ]
    render(<PendenciasAnterioresChip pendencias={pendencias} />)
    expect(screen.getByText("◂ junho: Internet em aberto")).toBeInTheDocument()
  })

  it("test_duas_ou_mais_pendencias_resume_contagem_e_mes_mais_recente", () => {
    const pendencias: PendenciaAnterior[] = [
      { contaId: "internet", titulo: "Internet", competencia: "2026-05", vencimento: "2026-05-05" },
      { contaId: "agua", titulo: "Água", competencia: "2026-06", vencimento: "2026-06-25" },
    ]
    render(<PendenciasAnterioresChip pendencias={pendencias} />)
    expect(screen.getByText("◂ 2 em aberto de junho")).toBeInTheDocument()
  })

  it("test_clique_abre_lista_completa_com_link_para_cada_conta", () => {
    const pendencias: PendenciaAnterior[] = [
      { contaId: "internet", titulo: "Internet", competencia: "2026-05", vencimento: "2026-05-05" },
      { contaId: "agua", titulo: "Água", competencia: "2026-06", vencimento: "2026-06-25" },
    ]
    render(<PendenciasAnterioresChip pendencias={pendencias} />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button"))

    expect(screen.getByRole("link", { name: /Internet/ })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/internet",
    )
    expect(screen.getByRole("link", { name: /Água/ })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/agua",
    )
  })
})
