// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PaymentWizard } from "./PaymentWizard"
import type { PaymentFormInicial } from "./payment-form-inicial"

const pessoas = [
  {
    id: "p-1",
    nome: "Thiago",
    email: "thiago@x.com",
    hue: 211,
    inicial: "T",
    avatarKey: null,
    avatarUrl: null,
  },
  {
    id: "p-2",
    nome: "Jakeline",
    email: "jakeline@x.com",
    hue: 14,
    inicial: "J",
    avatarKey: null,
    avatarUrl: null,
  },
]

const inicial: PaymentFormInicial = {
  valor: "129,90",
  dataPagamento: "2026-07-02",
  competencia: "2026-07",
  paidBy: "p-1",
}

afterEach(cleanup)

describe("PaymentWizard (Seam 3)", () => {
  it("test_percorre_assuntos_preserva_dados_e_confirma_no_resumo", async () => {
    const user = userEvent.setup()
    const formAction = vi.fn()
    render(
      <PaymentWizard
        formAction={formAction}
        pessoas={pessoas}
        inicial={inicial}
        competenciasComLancamento={["2026-07"]}
        arquivos={[]}
        onArquivosChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("Competência")).toHaveValue("2026-07")
    expect(screen.getByRole("status")).toHaveTextContent(/pode registrar mesmo assim/i)

    await user.click(screen.getByRole("button", { name: "Continuar →" }))
    expect(screen.getByLabelText("Valor real")).toHaveValue("129,90")
    await user.click(screen.getByRole("button", { name: "Continuar →" }))
    expect(screen.getByRole("button", { name: /Thiago/ })).toHaveAttribute("aria-pressed", "true")
    await user.click(screen.getByRole("button", { name: "Continuar →" }))
    expect(screen.getByText("Escolher imagens ou PDFs")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Continuar →" }))

    expect(screen.getByText("R$ 129,90")).toBeInTheDocument()
    expect(screen.getByText("02/07/2026")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Confirmar e registrar" }))
    expect(formAction).toHaveBeenCalledOnce()
  })

  it("test_comprovante_aceita_multiplos_arquivos_opcionais", async () => {
    const user = userEvent.setup()
    const onArquivosChange = vi.fn()
    const { container } = render(
      <PaymentWizard
        formAction={() => {}}
        pessoas={pessoas}
        inicial={inicial}
        arquivos={[]}
        onArquivosChange={onArquivosChange}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Continuar →" }))
    await user.click(screen.getByRole("button", { name: "Continuar →" }))
    await user.click(screen.getByRole("button", { name: "Continuar →" }))
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    await user.upload(input as HTMLInputElement, [
      new File(["imagem"], "comprovante.png", { type: "image/png" }),
      new File(["pdf"], "recibo.pdf", { type: "application/pdf" }),
    ])

    expect(onArquivosChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "comprovante.png" }),
      expect.objectContaining({ name: "recibo.pdf" }),
    ])
  })
})
