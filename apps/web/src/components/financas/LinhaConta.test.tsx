// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { GridEstado } from "@/core/use-cases/derive-bill-card"
import type { LinhaConta as LinhaContaModel } from "@/core/use-cases/derive-linha-conta"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

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

import { LinhaConta } from "./LinhaConta"

afterEach(cleanup)

const bill: Bill = {
  id: "bill-1",
  householdId: "house-1",
  nome: "Condomínio",
  descricao: "Moradia",
  icon: "home",
  recurrence: { intervalMonths: 1, anchorMonth: null },
  dueRule: { kind: "dia-fixo", day: 10 },
  dueMonthOffset: 0,
  primeiraCompetencia: "2020-01",
  estado: "ativa",
  encerradaEm: null,
  logoKey: null,
}

const estados: GridEstado[] = [
  "em-dia",
  "atraso-leve",
  "atraso",
  "em-aberto",
  "aguardando",
  "pago-sem-data",
]

function linhaBase(over: Partial<LinhaContaModel> = {}): LinhaContaModel {
  return {
    billId: "bill-1",
    farol: "amarelo",
    frase: "vence em 2 dias",
    competenciaVigente: "2026-07",
    vencimento: "2026-07-10",
    grid: Array.from({ length: 12 }, (_, index) => ({
      competencia: `2025-${String(index + 1).padStart(2, "0")}`,
      vencimento: `2025-${String(index + 1).padStart(2, "0")}-10`,
      estado: estados[index % estados.length],
      valor: index % 3 === 0 ? null : 100000 + index * 1000,
    })),
    valor: { estado: "estimativa", media: 123456 },
    autoria: null,
    media: 123456,
    pontualidade: { estado: "calculada", percentual: 80 },
    ...over,
  }
}

const pessoas: PessoaComAvatar[] = [
  {
    id: "p-1",
    nome: "Thiago",
    inicial: "T",
    email: "t@x.com",
    googleEmail: null,
    hue: 200,
    avatarKey: null,
    avatarUrl: null,
  },
  {
    id: "p-2",
    nome: "Jakeline",
    inicial: "J",
    email: "j@x.com",
    googleEmail: null,
    hue: 320,
    avatarKey: null,
    avatarUrl: null,
  },
]

const lancamentos: Payment[] = [
  {
    id: "pay-1",
    householdId: "house-1",
    billId: "bill-1",
    valor: 100000,
    dataPagamento: "2026-06-08",
    competencia: "2026-06",
    paidBy: "p-1",
  },
  {
    id: "pay-2",
    householdId: "house-1",
    billId: "bill-1",
    valor: 100000,
    dataPagamento: "2026-05-08",
    competencia: "2026-05",
    paidBy: "p-2",
  },
]

describe("LinhaConta", () => {
  it("test_exibe_frase_grid_e_valor_estimativa_fechada", () => {
    render(<LinhaConta bill={bill} linha={linhaBase()} pessoas={pessoas} lancamentos={[]} />)

    expect(screen.getByText("vence em 2 dias")).toBeInTheDocument()
    expect(screen.getAllByTestId("grid-cell")).toHaveLength(12)
    expect(screen.getByText("~R$ 1.234,56")).toBeInTheDocument()
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false")
  })

  it("test_valor_real_quando_quitada", () => {
    render(
      <LinhaConta
        bill={bill}
        linha={linhaBase({ valor: { estado: "real", valor: 55000 } })}
        pessoas={pessoas}
        lancamentos={[]}
      />,
    )

    expect(screen.getByText("R$ 550,00")).toBeInTheDocument()
  })

  it("test_clique_na_linha_expande_e_mostra_sparkline_media_pontualidade_e_ultimos_lancamentos", () => {
    render(
      <LinhaConta bill={bill} linha={linhaBase()} pessoas={pessoas} lancamentos={lancamentos} />,
    )

    fireEvent.click(screen.getByRole("button"))

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Valores · 12 competências")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Histórico de valores pagos/ })).toBeInTheDocument()
    expect(screen.getByText("80% em dia")).toBeInTheDocument()
    expect(screen.getByText("Últimos Lançamentos")).toBeInTheDocument()
    expect(screen.queryByText("Thiago")).not.toBeInTheDocument() // compact chip não mostra nome
  })

  it("test_acao_interna_navega_e_nao_dispara_o_toggle", () => {
    render(
      <LinhaConta bill={bill} linha={linhaBase()} pessoas={pessoas} lancamentos={lancamentos} />,
    )

    fireEvent.click(screen.getByRole("button"))
    const registrar = screen.getByRole("link", { name: "Registrar pagamento" })
    expect(registrar).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/bill-1?registrar=1&competencia=2026-07",
    )

    fireEvent.click(registrar)
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true")
  })

  it("test_seis_estados_do_grid_sao_visiveis_e_acessiveis", () => {
    render(<LinhaConta bill={bill} linha={linhaBase()} pessoas={pessoas} lancamentos={[]} />)

    const cells = screen.getAllByTestId("grid-cell")
    const estadosPresentes = new Set(cells.map((cell) => cell.dataset.estado))
    expect(estadosPresentes).toEqual(new Set(estados))
  })

  it("test_teclado_enter_expande_a_linha", async () => {
    const user = userEvent.setup()
    render(<LinhaConta bill={bill} linha={linhaBase()} pessoas={pessoas} lancamentos={[]} />)

    await user.tab()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true")
  })
})
