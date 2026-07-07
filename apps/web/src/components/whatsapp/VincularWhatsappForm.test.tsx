// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { vincularMeuWhatsapp } from "@/app/(app)/whatsapp/actions"
import { VincularWhatsappForm } from "./VincularWhatsappForm"

vi.mock("@/app/(app)/whatsapp/actions", () => ({
  vincularMeuWhatsapp: vi.fn(async () => ({})),
}))

const vincularMock = vi.mocked(vincularMeuWhatsapp)

afterEach(() => {
  cleanup()
  vincularMock.mockClear()
})

describe("VincularWhatsappForm (side quest #152)", () => {
  it("test_estado_vazio_mostra_mensagem_e_botao_vincular_sem_pill_nem_remover", () => {
    render(<VincularWhatsappForm whatsappPhone={null} />)

    expect(screen.getByText("Nenhum número vinculado ainda")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Vincular" })).toBeInTheDocument()
    expect(screen.queryByText("vinculado")).toBeNull()
    expect(screen.queryByRole("link", { name: "Remover vínculo" })).toBeNull()
  })

  it("test_estado_vinculado_mostra_numero_formatado_pill_e_botao_trocar", () => {
    render(<VincularWhatsappForm whatsappPhone="+5511987654321" />)

    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument()
    expect(screen.getByText("vinculado")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Trocar" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Remover vínculo" })).toHaveAttribute(
      "href",
      "/whatsapp?remover=1",
    )
  })

  it("test_mascara_aplica_no_input_enquanto_digita", async () => {
    const user = userEvent.setup()
    render(<VincularWhatsappForm whatsappPhone={null} />)
    const input = screen.getByLabelText("Número do WhatsApp")

    await user.type(input, "11987654321")

    expect(input).toHaveValue("(11) 98765-4321")
  })

  it("test_submissao_de_erro_mostra_mensagem_associada_ao_campo", async () => {
    const user = userEvent.setup()
    vincularMock.mockResolvedValueOnce({ erro: "Telefone inválido — confira o DDD e o número." })
    render(<VincularWhatsappForm whatsappPhone={null} />)

    await user.type(screen.getByLabelText("Número do WhatsApp"), "123")
    await user.click(screen.getByRole("button", { name: "Vincular" }))

    const erro = await screen.findByRole("alert")
    expect(erro).toHaveTextContent("Telefone inválido")
    expect(screen.getByLabelText("Número do WhatsApp")).toHaveAttribute("aria-invalid", "true")
  })
})
