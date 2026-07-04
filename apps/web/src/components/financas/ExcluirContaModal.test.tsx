// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExcluirContaModal } from "./ExcluirContaModal"

// next/navigation não tem router montado nos testes — mockamos o mínimo (o X do
// Modal usa `useRouter`). A navegação em si é do Next, não deste seam.
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/areas/financas/pagamentos-recorrentes",
}))

afterEach(() => {
  cleanup()
  replace.mockClear()
})

const CLOSE = "/areas/financas/pagamentos-recorrentes"

function renderModal(action: (formData: FormData) => void | Promise<void> = () => {}) {
  return render(<ExcluirContaModal billName="Luz" action={action} closeHref={CLOSE} />)
}

describe("ExcluirContaModal (#99)", () => {
  it("test_confirmacao_identifica_conta_e_afirma_que_lancamentos_permanecem", () => {
    renderModal()
    // diálogo compacto do protótipo Final: título "Excluir {nome}?"
    expect(screen.getByRole("dialog", { name: "Excluir Luz?" })).toBeInTheDocument()
    // botão de confirmação do gesto
    expect(screen.getByRole("button", { name: "Excluir Conta" })).toBeInTheDocument()
    // a confirmação afirma explicitamente que os fatos permanecem (não é destrutivo)
    expect(screen.getByRole("dialog")).toHaveTextContent(/Lançamentos.*permanecem/i)
    // cartão compacto do protótipo (até 400px, central com margem)
    expect(screen.getByRole("dialog")).toHaveClass("max-w-[400px]")
  })

  it("test_submeter_encerra_a_conta_via_action", async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    renderModal(action)
    await user.click(screen.getByRole("button", { name: "Excluir Conta" }))
    expect(action).toHaveBeenCalled()
  })

  it("test_cancelar_e_fechar_voltam_sem_encerrar", async () => {
    const user = userEvent.setup()
    // Cancelar leva de volta à lista sem tocar a Conta
    renderModal()
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", CLOSE)
    // o X do Modal dispensa via replace (o Back não reabre o overlay)
    await user.click(screen.getByRole("button", { name: "Fechar" }))
    expect(replace).toHaveBeenCalledWith(CLOSE, { scroll: false })
  })
})
