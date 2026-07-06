// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { ConnectedNovaContaForm } from "./ConnectedNovaContaForm"

/**
 * Integração da borda: a fiação `useActionState` → redirect no sucesso e erros
 * mantidos no form. O comportamento do form em si é do `NovaContaForm` (Seam 3);
 * aqui só a costura com o server action. Como o submit mora na 2ª etapa, os casos
 * avançam com "Próximo →" antes de "Cadastrar Conta".
 */
const replace = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}))

beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe("ConnectedNovaContaForm — costura com o action", () => {
  it("test_sucesso_redireciona_para_o_successHref", async () => {
    const user = userEvent.setup()
    const action = vi.fn(
      async (): Promise<ContaFormState> => ({ erros: [], createdBillId: "bill-9" }),
    )
    render(<ConnectedNovaContaForm action={action} successHref="/rota/lista" />)

    await user.click(screen.getByRole("button", { name: "Próximo →" }))
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))

    // o redirect nasce no efeito que reage ao createdBillId — espera-o assentar
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/rota/lista"))
    expect(action).toHaveBeenCalledOnce()
  })

  it("test_erro_de_validacao_mantem_o_form_e_nao_redireciona", async () => {
    const user = userEvent.setup()
    const action = vi.fn(
      async (): Promise<ContaFormState> => ({
        erros: [{ campo: "nome", mensagem: "Dê um nome à Conta." }],
      }),
    )
    render(<ConnectedNovaContaForm action={action} successHref="/rota/lista" />)

    await user.click(screen.getByRole("button", { name: "Próximo →" }))
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))

    expect(await screen.findByText("Dê um nome à Conta.")).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
