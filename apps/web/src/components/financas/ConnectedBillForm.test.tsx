// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { confirmarLogoConta, prepararLogoConta } from "@/app/(app)/areas/financas/actions"
import { ConnectedBillForm } from "./ConnectedBillForm"

// O router não está montado no teste — o sucesso do fluxo é um router.replace.
const replace = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}))

// As Server Actions de logo arrastam @/auth (next-auth), fora do jsdom. O seam
// aqui é a orquestração no cliente: cria a Conta (action) → prepara → PUT →
// confirma, e o que ela FAZ quando um desses ramos falha (loga + surfacea).
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararLogoConta: vi.fn(),
  confirmarLogoConta: vi.fn(),
}))

const prepararMock = vi.mocked(prepararLogoConta)
const confirmarMock = vi.mocked(confirmarLogoConta)

/** O action de criação, mockado: a Conta nasce e devolve o id que dispara o finalizar. */
const CRIADA: ContaFormState = { erros: [], createdBillId: "bill-1" }

function logo(): File {
  return new File(["x"], "logo.png", { type: "image/png" })
}

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  prepararMock.mockReset()
  confirmarMock.mockReset()
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true }) as Response),
  )
})

afterEach(() => {
  cleanup()
  errSpy.mockRestore()
  replace.mockClear()
  refresh.mockClear()
  vi.unstubAllGlobals()
})

/**
 * Renderiza o form em modo de criação, seleciona um logo (passo Identidade) e
 * caminha o wizard até o Resumo, onde o submit dispara o action e, no sucesso,
 * o `finalizarCriacao` (prepara → PUT → confirma).
 */
async function criarComLogo(user: ReturnType<typeof userEvent.setup>) {
  const action = vi.fn(async () => CRIADA)
  const utils = render(<ConnectedBillForm action={action} createMode />)
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, logo())
  await user.click(screen.getByRole("button", { name: "Próximo →" }))
  await user.click(screen.getByRole("button", { name: "Próximo →" }))
  await user.click(screen.getByRole("button", { name: "Próximo →" }))
  await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))
  return { action, ...utils }
}

describe("ConnectedBillForm — finalização da criação com logo (#138)", () => {
  it("test_upload_feliz_navega_e_nao_loga_erro", async () => {
    prepararMock.mockResolvedValue({ ok: true, uploadId: "up-1", uploadUrl: "https://r2.fake/put" })
    confirmarMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    await criarComLogo(user)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes"),
    )
    expect(refresh).toHaveBeenCalled()
    expect(errSpy).not.toHaveBeenCalled()
  })

  it("test_falha_no_put_loga_e_exibe_causa", async () => {
    prepararMock.mockResolvedValue({ ok: true, uploadId: "up-1", uploadUrl: "https://r2.fake/put" })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    )
    const user = userEvent.setup()

    await criarComLogo(user)

    expect(await screen.findByText("Não foi possível enviar o logo.")).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), expect.any(Error))
  })

  it("test_confirmar_com_erro_loga_e_exibe_causa", async () => {
    prepararMock.mockResolvedValue({ ok: true, uploadId: "up-1", uploadUrl: "https://r2.fake/put" })
    confirmarMock.mockResolvedValue({ ok: false, erro: "Confirmação recusada." })
    const user = userEvent.setup()

    await criarComLogo(user)

    expect(await screen.findByText("Confirmação recusada.")).toBeInTheDocument()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), expect.any(Error))
  })

  it("test_preparar_com_erro_loga_e_exibe_causa", async () => {
    prepararMock.mockResolvedValue({ ok: false, erro: "Envie uma imagem." })
    const user = userEvent.setup()

    await criarComLogo(user)

    expect(await screen.findByText("Envie uma imagem.")).toBeInTheDocument()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), expect.any(Error))
  })

  it("test_excecao_inesperada_loga_a_causa_real", async () => {
    prepararMock.mockResolvedValue({ ok: true, uploadId: "up-1", uploadUrl: "https://r2.fake/put" })
    const boom = new Error("conexão caiu")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw boom
      }),
    )
    const user = userEvent.setup()

    await criarComLogo(user)

    // A causa real chega ao log — não é engolida — e vira a mensagem exibida.
    expect(await screen.findByText("conexão caiu")).toBeInTheDocument()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), boom)
  })
})
