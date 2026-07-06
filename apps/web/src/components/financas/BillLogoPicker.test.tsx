// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  errSpy.mockRestore()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function arquivo(nome = "logo.png", tipo = "image/png") {
  return new File(["conteudo"], nome, { type: tipo })
}

describe("BillLogoPicker", () => {
  it("test_modo_diferido_retem_o_arquivo_e_nao_inicia_upload", async () => {
    const onFileChange = vi.fn()
    const createObjectURL = vi.fn(() => "blob:logo-preview")
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL })
    const user = userEvent.setup()
    const { container, rerender } = render(
      <BillLogoPicker mode="deferred" icon="wifi" file={null} onFileChange={onFileChange} />,
    )

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = arquivo()
    await user.upload(input, file)

    // A seleção passa pela normalização no cliente (assíncrona) antes de reter o arquivo.
    await waitFor(() => expect(onFileChange).toHaveBeenCalledWith(file))
    expect(prepararLogoConta).not.toHaveBeenCalled()
    expect(confirmarLogoConta).not.toHaveBeenCalled()

    rerender(<BillLogoPicker mode="deferred" icon="wifi" file={file} onFileChange={onFileChange} />)
    expect(createObjectURL).toHaveBeenCalledWith(file)
    expect(await screen.findByAltText("")).toHaveAttribute("src", "blob:logo-preview")
  })

  it("test_modo_diferido_rejeita_arquivo_grande_com_o_limite_e_nao_retem", async () => {
    const onFileChange = vi.fn()
    vi.stubGlobal("URL", { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
    const user = userEvent.setup()
    const { container } = render(
      <BillLogoPicker mode="deferred" icon="wifi" file={null} onFileChange={onFileChange} />,
    )

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const grande = arquivo()
    Object.defineProperty(grande, "size", { value: 6 * 1024 * 1024 })
    await user.upload(input, grande)

    expect(await screen.findByRole("alert")).toHaveTextContent("5 MB")
    expect(onFileChange).not.toHaveBeenCalled()
  })

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

  it("test_erro_ao_preparar_loga_o_contexto", async () => {
    prepararLogoConta.mockResolvedValue({ ok: false, erro: "Envie uma imagem." })
    vi.stubGlobal("fetch", vi.fn())

    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl={null} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, arquivo())

    expect(await screen.findByRole("alert")).toHaveTextContent("Envie uma imagem.")
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), expect.anything())
  })

  it("test_falha_no_put_loga_e_exibe_mensagem", async () => {
    prepararLogoConta.mockResolvedValue({
      ok: true,
      uploadId: "up-1",
      uploadUrl: "https://r2.fake/put/x",
    })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl={null} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, arquivo())

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao subir o arquivo. Tente de novo.",
    )
    expect(confirmarLogoConta).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), expect.anything())
  })

  it("test_confirmar_com_erro_loga_e_exibe_mensagem", async () => {
    prepararLogoConta.mockResolvedValue({
      ok: true,
      uploadId: "up-1",
      uploadUrl: "https://r2.fake/put/x",
    })
    confirmarLogoConta.mockResolvedValue({ ok: false, erro: "Confirmação recusada." })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))

    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl={null} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, arquivo())

    expect(await screen.findByRole("alert")).toHaveTextContent("Confirmação recusada.")
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), expect.anything())
  })

  it("test_excecao_inesperada_loga_a_causa_real_e_exibe_mensagem", async () => {
    prepararLogoConta.mockResolvedValue({
      ok: true,
      uploadId: "up-1",
      uploadUrl: "https://r2.fake/put/x",
    })
    const boom = new Error("conexão caiu")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(boom))

    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl={null} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, arquivo())

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo deu errado ao enviar o logo.")
    // A causa real chega ao log — não é engolida.
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[logo]"), boom)
  })

  it("test_remover_chama_a_action_e_atualiza", async () => {
    removerLogoConta.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<BillLogoPicker billId="bill-1" icon="wifi" logoUrl="https://r2.fake/x" />)

    await user.click(screen.getByRole("button", { name: "Remover" }))

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(removerLogoConta).toHaveBeenCalledWith("bill-1")
  })

  it("test_variante_compacta_mostra_o_logo_pelo_tile_unico_escurecido", () => {
    const { container } = render(
      <BillLogoPicker billId="bill-1" icon="wifi" logoUrl="https://r2.fake/x" variant="compacto" />,
    )

    // #139: o swatch do logo personalizado passa pelo tile único, levemente escurecido.
    const img = container.querySelector("img") as HTMLImageElement
    expect(img).toHaveClass("brightness-90")

    // URL assinada que expira não trava mais num <img> quebrado: cai no ícone.
    fireEvent.error(img)
    expect(container.querySelector("img")).toBeNull()
  })
})
