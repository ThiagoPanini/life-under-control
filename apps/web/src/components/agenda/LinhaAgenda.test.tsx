// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ItemAgendaView } from "@/core/use-cases/derive-agenda"

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

import { LinhaAgenda } from "./LinhaAgenda"

afterEach(cleanup)

function itemBase(over: Partial<ItemAgendaView> = {}): ItemAgendaView {
  return {
    area: "financas",
    geradorId: "bill-1",
    competencia: "2026-07",
    titulo: "Netflix",
    vencimento: "2026-07-10",
    estado: "aguardando",
    farol: "amarelo",
    frase: "vence em 2 dias",
    assunto: "Pagamentos Recorrentes",
    valorEstimado: 4590,
    ...over,
  }
}

describe("LinhaAgenda", () => {
  it("test_exibe_data_dia_da_semana_titulo_assunto_frase_e_valor_estimativa", () => {
    render(<LinhaAgenda item={itemBase()} />)

    expect(screen.getByText("10/07/2026")).toBeInTheDocument()
    expect(screen.getByText("sex")).toBeInTheDocument() // 10/07/2026 é sexta-feira
    expect(screen.getByText("Netflix")).toBeInTheDocument()
    expect(screen.getByText("Conta · Pagamentos Recorrentes")).toBeInTheDocument()
    expect(screen.getByText("vence em 2 dias")).toBeInTheDocument()
    expect(screen.getByText("~R$ 45,90")).toBeInTheDocument()
    expect(screen.getByText("estimativa")).toBeInTheDocument()
  })

  it("test_sem_historico_mostra_texto_explicito_sem_travessao_morto", () => {
    render(<LinhaAgenda item={itemBase({ valorEstimado: null })} />)

    expect(screen.getByText("sem histórico")).toBeInTheDocument()
    expect(screen.queryByText("—")).not.toBeInTheDocument()
    expect(screen.queryByText("estimativa")).not.toBeInTheDocument()
  })

  it("test_cta_da_linha_abre_registro_com_competencia_pre_selecionada", () => {
    render(<LinhaAgenda item={itemBase({ geradorId: "netflix", competencia: "2026-07" })} />)

    const registro = screen.getByRole("link", { name: /Netflix/ })
    expect(registro).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/netflix?registrar=1&competencia=2026-07",
    )
  })

  it("test_link_ver_conta_abre_so_o_detalhe_sem_competencia_nem_hash", () => {
    render(<LinhaAgenda item={itemBase({ geradorId: "netflix" })} />)

    const verConta = screen.getByRole("link", { name: "Ver Conta →" })
    expect(verConta).toHaveAttribute("href", "/areas/financas/pagamentos-recorrentes/netflix")
  })

  it("test_farol_e_aria_hidden_a_frase_sempre_acompanha_visivel", () => {
    const { container } = render(<LinhaAgenda item={itemBase()} />)

    const dot = container.querySelector("[aria-hidden]")
    expect(dot).not.toBeNull()
    expect(screen.getByText("vence em 2 dias")).toBeInTheDocument()
  })
})
