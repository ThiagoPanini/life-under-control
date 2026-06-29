// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Payment } from "@/core/domain/payment"
import { PaymentForm } from "./PaymentForm"
import { type PaymentFormInicial, paymentParaInicial } from "./payment-form-inicial"

/**
 * Seam 3: a lógica de borda da baixa — pré-preenchimento, o aviso (não-travante)
 * de competência repetida e o disparo do action. A validação-fonte é do núcleo
 * (Seam 1); aqui só o comportamento da interface, com um `formAction` falso.
 */
const noop = () => {}
const PESSOAS = [
  { id: "p-1", nome: "Thiago" },
  { id: "p-2", nome: "Jakeline" },
]

function inicial(over: Partial<PaymentFormInicial> = {}): PaymentFormInicial {
  return {
    valor: "129,90",
    dataPagamento: "2026-06-29",
    competencia: "2026-06",
    paidBy: "p-1",
    ...over,
  }
}

afterEach(cleanup)

describe("paymentParaInicial (Seam 3)", () => {
  it("test_projeta_o_lancamento_em_strings_do_formulario", () => {
    const pay: Payment = {
      id: "pay-1",
      householdId: "h-1",
      billId: "bill-1",
      valor: 123456,
      dataPagamento: "2026-05-10",
      competencia: "2026-05",
      paidBy: "p-2",
    }
    expect(paymentParaInicial(pay)).toEqual({
      valor: "1234,56",
      dataPagamento: "2026-05-10",
      competencia: "2026-05",
      paidBy: "p-2",
    })
  })

  it("test_data_nula_vira_campo_vazio", () => {
    const pay: Payment = {
      id: "pay-2",
      householdId: "h-1",
      billId: "bill-1",
      valor: 5000,
      dataPagamento: null,
      competencia: "2026-05",
      paidBy: "p-1",
    }
    expect(paymentParaInicial(pay).dataPagamento).toBe("")
  })
})

describe("PaymentForm — pré-preenchimento (Seam 3)", () => {
  it("test_pre_preenche_valor_competencia_e_data", () => {
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial()} />)
    expect(screen.getByLabelText("Valor")).toHaveValue("129,90")
    expect(screen.getByLabelText("Competência")).toHaveValue("2026-06")
    expect(screen.getByLabelText("Data de pagamento")).toHaveValue("2026-06-29")
  })

  it("test_quem_pagou_default_a_logada", () => {
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial({ paidBy: "p-2" })} />)
    expect(screen.getByLabelText("Quem pagou")).toHaveValue("p-2")
  })
})

describe("PaymentForm — aviso de competência repetida (Seam 3)", () => {
  it("test_avisa_quando_competencia_ja_tem_lancamento", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial({ competencia: "2026-06" })}
        competenciasComLancamento={["2026-06"]}
      />,
    )
    expect(screen.getByRole("status")).toHaveTextContent(/já existe um lançamento/i)
  })

  it("test_nao_avisa_quando_competencia_inedita", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial({ competencia: "2026-07" })}
        competenciasComLancamento={["2026-06"]}
      />,
    )
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("test_aviso_nao_trava_a_submissao", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial({ competencia: "2026-06" })}
        competenciasComLancamento={["2026-06"]}
      />,
    )
    // o aviso aparece, mas o botão de submeter continua habilitado (não bloqueia)
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Dar baixa" })).toBeEnabled()
  })

  it("test_aviso_some_ao_trocar_para_competencia_inedita", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial({ competencia: "2026-06" })}
        competenciasComLancamento={["2026-06"]}
      />,
    )
    expect(screen.getByRole("status")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Competência"), { target: { value: "2026-08" } })
    expect(screen.queryByRole("status")).toBeNull()
  })
})

describe("PaymentForm — disparo e erros (Seam 3)", () => {
  it("test_submeter_chama_o_action", async () => {
    const formAction = vi.fn()
    const user = userEvent.setup()
    render(<PaymentForm formAction={formAction} pessoas={PESSOAS} inicial={inicial()} />)
    await user.click(screen.getByRole("button", { name: "Dar baixa" }))
    expect(formAction).toHaveBeenCalledOnce()
  })

  it("test_erro_do_servidor_exibe_mensagem_no_campo", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial()}
        erros={[{ campo: "valor", mensagem: "Informe um valor maior que zero." }]}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um valor maior que zero.")
  })

  it("test_rotulos_de_edicao_quando_passados", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial()}
        submitLabel="Salvar"
        onCancelar={noop}
      />,
    )
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument()
  })
})
