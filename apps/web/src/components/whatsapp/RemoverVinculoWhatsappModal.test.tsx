// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RemoverVinculoWhatsappModal } from "./RemoverVinculoWhatsappModal"

// next/navigation não tem router montado nos testes — mockamos o mínimo (o X do
// Modal usa `useRouter`). A navegação em si é do Next, não deste seam.
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/whatsapp",
}))

afterEach(() => {
  cleanup()
  replace.mockClear()
})

const CLOSE = "/whatsapp"

function renderModal(action: () => void | Promise<void> = () => {}) {
  return render(
    <RemoverVinculoWhatsappModal telefone="(11) 98765-4321" action={action} closeHref={CLOSE} />,
  )
}

describe("RemoverVinculoWhatsappModal (side quest #152)", () => {
  it("test_confirmacao_avisa_que_o_bot_para_de_reconhecer_o_numero", () => {
    renderModal()

    expect(screen.getByRole("dialog", { name: "Remover vínculo do WhatsApp?" })).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /para de reconhecer mensagens de \(11\) 98765-4321/,
    )
  })

  it("test_submeter_dispara_a_action_de_remocao", async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    renderModal(action)

    await user.click(screen.getByRole("button", { name: "Remover vínculo" }))

    expect(action).toHaveBeenCalled()
  })

  it("test_cancelar_volta_sem_remover", () => {
    renderModal()

    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", CLOSE)
  })
})
