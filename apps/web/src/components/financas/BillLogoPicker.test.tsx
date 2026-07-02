// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const prepararLogoConta = vi.fn()
const confirmarLogoConta = vi.fn()
const removerLogoConta = vi.fn()
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararLogoConta: (...args: unknown[]) => prepararLogoConta(...args),
  confirmarLogoConta: (...args: unknown[]) => confirmarLogoConta(...args),
  removerLogoConta: (...args: unknown[]) => removerLogoConta(...args),
}))

import { BillLogoPicker } from "./BillLogoPicker"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function arquivo(nome = "logo.png", tipo = "image/png") {
  return new File(["conteudo"], nome, { type: tipo })
}

describe("BillLogoPicker", () => {
  it("test_sem_logo_mostra_enviar_e_sem_botao_remover", () => {
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl={null} />)
    expect(screen.getByRole("button", { name: "Enviar logo" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remover" })).toBeNull()
  })

  it("test_com_logo_mostra_trocar_e_remover", () => {
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl="https://r2.fake/x" />)
    expect(screen.getByRole("button", { name: "Trocar logo" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remover" })).toBeInTheDocument()
  })

  it("test_upload_feliz_prepara_sobe_confirma_e_atualiza", async () => {
    prepararLogoConta.mockResolvedValue({
      ok: true,
      uploadId: "up-1",
      uploadUrl: "https://r2.fake/put/x",
    })
    confirmarLogoConta.mockResolvedValue({ ok: true })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl={null} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, arquivo())

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(prepararLogoConta).toHaveBeenCalledWith("bill-1", "image/png", expect.any(Number))
    expect(fetchMock).toHaveBeenCalledWith(
      "https://r2.fake/put/x",
      expect.objectContaining({ method: "PUT" }),
    )
    expect(confirmarLogoConta).toHaveBeenCalledWith("bill-1", "up-1")
  })

  it("test_erro_ao_preparar_exibe_mensagem_e_nao_sobe", async () => {
    prepararLogoConta.mockResolvedValue({ ok: false, erro: "Envie uma imagem." })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl={null} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, arquivo())

    expect(await screen.findByRole("alert")).toHaveTextContent("Envie uma imagem.")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("test_remover_chama_a_action_e_atualiza", async () => {
    removerLogoConta.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl="https://r2.fake/x" />)

    await user.click(screen.getByRole("button", { name: "Remover" }))

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(removerLogoConta).toHaveBeenCalledWith("bill-1")
  })
})
