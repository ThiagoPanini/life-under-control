// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { confirmarLogoConta, prepararLogoConta } from "@/app/(app)/areas/financas/actions"
import { ConnectedNovaContaForm } from "./ConnectedNovaContaForm"

/**
 * Integração da borda: a fiação `useActionState` → redirect no sucesso e erros
 * mantidos no form. O comportamento do form em si é do `ContaForm` (Seam 3);
 * aqui fica a costura com o server action e a finalização opcional do logo.
 */
const replace = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}))

vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararLogoConta: vi.fn(),
  confirmarLogoConta: vi.fn(),
}))

const prepararMock = vi.mocked(prepararLogoConta)
const confirmarMock = vi.mocked(confirmarLogoConta)
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
  prepararMock.mockReset()
  confirmarMock.mockReset()
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  errorSpy.mockRestore()
  vi.unstubAllGlobals()
})

describe("ConnectedNovaContaForm — costura com o action", () => {
  it("test_sucesso_redireciona_para_o_successHref", async () => {
    const user = userEvent.setup()
    const action = vi.fn(
      async (): Promise<ContaFormState> => ({ erros: [], createdBillId: "bill-9" }),
    )
    render(<ConnectedNovaContaForm action={action} successHref="/rota/lista" />)

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

    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))

    expect(await screen.findByText("Dê um nome à Conta.")).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it("test_retry_do_logo_nao_recria_a_conta", async () => {
    const user = userEvent.setup()
    const action = vi.fn(
      async (): Promise<ContaFormState> => ({ erros: [], createdBillId: "bill-9" }),
    )
    prepararMock
      .mockResolvedValueOnce({ ok: false, erro: "Storage indisponível." })
      .mockResolvedValueOnce({
        ok: true,
        uploadId: "up-1",
        uploadUrl: "https://r2.fake/put",
      })
    confirmarMock.mockResolvedValue({ ok: true })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }) as Response),
    )
    const { container } = render(
      <ConnectedNovaContaForm action={action} successHref="/rota/lista" />,
    )

    await user.click(screen.getByRole("button", { name: "Logo customizado" }))
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["logo"], "logo.png", { type: "image/png" }),
    )
    // A seleção normaliza no cliente antes de reter — espera o chip do arquivo.
    await screen.findByText("logo.png")
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))

    expect(await screen.findByText(/Conta criada, complete o logo pelo Editar/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Tentar o logo novamente" }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/rota/lista"))
    expect(action).toHaveBeenCalledOnce()
    expect(prepararMock).toHaveBeenCalledTimes(2)
  })
})
