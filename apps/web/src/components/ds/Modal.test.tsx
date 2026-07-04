// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Modal } from "./Modal"

// next/navigation não tem router montado nos testes — o fechar do Modal é um
// router.replace; espionamos o mínimo.
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}))

afterEach(() => {
  cleanup()
  replace.mockClear()
})

function renderModal(travado?: boolean) {
  return render(
    <Modal
      title="Registrar Lançamento"
      closeHref="/areas/financas/pagamentos-recorrentes"
      travado={travado}
    >
      <p>conteúdo</p>
    </Modal>,
  )
}

describe("Modal — trava de dismiss durante operação (#100)", () => {
  it("test_destravado_fecha_no_escape_e_no_backdrop", async () => {
    const user = userEvent.setup()
    renderModal()

    await user.keyboard("{Escape}")
    expect(replace).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes", {
      scroll: false,
    })

    replace.mockClear()
    await user.click(screen.getByRole("button", { name: "Fechar diálogo" }))
    expect(replace).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes", {
      scroll: false,
    })
  })

  it("test_travado_ignora_escape_e_backdrop", async () => {
    const user = userEvent.setup()
    renderModal(true)

    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Fechar diálogo" }))

    // uma operação em andamento não é descartada silenciosamente (AC13)
    expect(replace).not.toHaveBeenCalled()
  })

  it("test_travado_ainda_permite_o_x_explicito", async () => {
    const user = userEvent.setup()
    renderModal(true)

    // o X é ação deliberada, rotulada — não um descarte silencioso; segue funcional
    await user.click(screen.getByRole("button", { name: "Fechar" }))
    expect(replace).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes", {
      scroll: false,
    })
  })
})
