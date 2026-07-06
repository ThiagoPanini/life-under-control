// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PageHeader } from "./PageHeader"

afterEach(cleanup)

describe("PageHeader", () => {
  it("test_alinha_acoes_no_inicio_por_padrao", () => {
    render(<PageHeader title="Painel" actions={<button type="button">Ação</button>} />)
    expect(screen.getByRole("banner")).toHaveClass("items-start")
  })

  it("test_permite_centralizar_as_acoes_sem_mudar_o_padrao_global", () => {
    render(
      <PageHeader
        title="Pagamentos Recorrentes"
        actions={<button type="button">Nova Conta</button>}
        actionsAlign="center"
      />,
    )
    expect(screen.getByRole("banner")).toHaveClass("items-center")
  })
})
