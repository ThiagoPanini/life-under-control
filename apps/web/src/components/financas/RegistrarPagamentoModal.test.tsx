// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RegistrarPagamentoModal } from "./RegistrarPagamentoModal"

// next/navigation não tem router montado nos testes — mockamos o mínimo; a
// navegação em si (fechar/redirect) é do Next, não deste seam.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

// O módulo real de actions é "use server" e arrasta @/auth (next-auth) — fora
// do alcance do jsdom. O upload em duas etapas tem o próprio fluxo testado; o
// seam aqui é a composição do modal.
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararComprovante: vi.fn(),
  confirmarComprovante: vi.fn(),
}))

afterEach(cleanup)

const PESSOAS = [
  {
    id: "p-1",
    nome: "Thiago",
    email: "thiago@x.com",
    hue: 210,
    inicial: "T",
    avatarKey: null,
    avatarUrl: null,
  },
]

describe("RegistrarPagamentoModal (Seam 2)", () => {
  it("test_modal_compacto_competencia_fixa_nota_e_comprovantes", () => {
    const { container } = render(
      <RegistrarPagamentoModal
        billId="luz"
        billName="Luz"
        action={async () => ({ erros: [] })}
        pessoas={PESSOAS}
        inicial={{
          valor: "120,00",
          dataPagamento: "2026-07-09",
          competencia: "2026-07",
          paidBy: "p-1",
        }}
        competenciasComLancamento={[]}
        contexto="competência julho de 2026 · vence em 6 dias (18/07)"
        notaValor="estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento"
        closeHref="/areas/financas/pagamentos-recorrentes"
        successHref="/areas/financas/pagamentos-recorrentes?lancadoConta=luz"
      />,
    )

    expect(screen.getByRole("dialog", { name: "Luz" })).toBeInTheDocument()
    expect(screen.getByText("Registrar Lançamento")).toBeInTheDocument()
    expect(
      screen.getByText("competência julho de 2026 · vence em 6 dias (18/07)"),
    ).toBeInTheDocument()

    // competência fixa da ocorrência do bloco: hidden, sem campo editável
    expect(screen.queryByLabelText("Competência")).not.toBeInTheDocument()
    const hidden = container.querySelector('input[name="competencia"]')
    expect(hidden).toHaveAttribute("type", "hidden")
    expect(hidden).toHaveValue("2026-07")

    expect(
      screen.getByText(
        "estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Escolher imagens ou PDFs")).toBeInTheDocument()
  })
})
