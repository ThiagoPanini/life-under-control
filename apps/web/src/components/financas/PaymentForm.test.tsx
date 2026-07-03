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
  {
    id: "p-1",
    nome: "Thiago",
    email: "thiago@x.com",
    hue: 210,
    inicial: "T",
    avatarKey: null,
    avatarUrl: null,
  },
  {
    id: "p-2",
    nome: "Jakeline",
    email: "jakeline@x.com",
    hue: 320,
    inicial: "J",
    avatarKey: null,
    avatarUrl: null,
  },
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
    const { container } = render(
      <PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial()} />,
    )
    expect(screen.getByLabelText("Valor")).toHaveValue("129,90")
    expect(screen.getByLabelText("Competência")).toHaveValue("2026-06")
    expect(screen.getByLabelText("Data de pagamento")).toHaveTextContent("29/06/2026")
    expect(container.querySelector('input[name="dataPagamento"]')).toHaveValue("2026-06-29")
  })

  it("test_quem_pagou_default_a_logada", () => {
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial({ paidBy: "p-2" })} />)
    expect(screen.getByRole("button", { name: "Jakeline" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Thiago" })).toHaveAttribute("aria-pressed", "false")
  })
})

describe("PaymentForm — chips-toggle de Quem pagou (Seam 3, #63)", () => {
  it("test_chips_tem_aria_pressed_por_pessoa", () => {
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial({ paidBy: "p-1" })} />)
    expect(screen.getByRole("button", { name: "Thiago" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Jakeline" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("test_clicar_chip_troca_quem_pagou", async () => {
    const user = userEvent.setup()
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial({ paidBy: "p-1" })} />)
    await user.click(screen.getByRole("button", { name: "Jakeline" }))
    expect(screen.getByRole("button", { name: "Jakeline" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Thiago" })).toHaveAttribute("aria-pressed", "false")
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

  it("test_segunda_baixa_mesma_competencia_gera_aviso", async () => {
    // não é bloqueio rígido: o 1º clique arma a confirmação (não submete);
    // só "Confirmar" registra.
    const formAction = vi.fn()
    const user = userEvent.setup()
    render(
      <PaymentForm
        formAction={formAction}
        pessoas={PESSOAS}
        inicial={inicial({ competencia: "2026-06" })}
        competenciasComLancamento={["2026-06"]}
      />,
    )
    expect(screen.getByRole("status")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))
    expect(formAction).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Confirmar" }))
    expect(formAction).toHaveBeenCalledOnce()
  })

  it("test_cancelar_aviso_nao_registra", async () => {
    const formAction = vi.fn()
    const user = userEvent.setup()
    render(
      <PaymentForm
        formAction={formAction}
        pessoas={PESSOAS}
        inicial={inicial({ competencia: "2026-06" })}
        competenciasComLancamento={["2026-06"]}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))
    await user.click(screen.getByRole("button", { name: "Voltar" }))

    expect(formAction).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Registrar pagamento" })).toBeInTheDocument()
  })

  it("test_edicao_com_aviso_nao_duplica_o_cancelar", async () => {
    // em edição (onCancelar presente) + competência duplicada armada: o
    // "Cancelar" de sair da edição e o "Voltar" de desarmar não podem ter o
    // mesmo nome acessível.
    const user = userEvent.setup()
    const onCancelar = vi.fn()
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial({ competencia: "2026-06" })}
        competenciasComLancamento={["2026-06"]}
        onCancelar={onCancelar}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))

    expect(screen.getAllByRole("button", { name: "Cancelar" })).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(onCancelar).toHaveBeenCalledOnce()
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
    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))
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

describe("PaymentForm — modo compacto do modal (Final)", () => {
  it("test_competencia_oculta_submete_hidden_e_mantem_aviso", () => {
    const { container } = render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial()}
        competenciaOculta
        competenciasComLancamento={["2026-06"]}
      />,
    )
    expect(screen.queryByLabelText("Competência")).not.toBeInTheDocument()
    const hidden = container.querySelector('input[name="competencia"]')
    expect(hidden).toHaveAttribute("type", "hidden")
    expect(hidden).toHaveValue("2026-06")
    // a trava de duplicidade não depende do campo visível
    expect(screen.getByRole("status")).toHaveTextContent("Já existe um Lançamento")
  })

  it("test_nota_de_estimativa_sob_o_valor", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial()}
        notaValor="estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento"
      />,
    )
    expect(
      screen.getByText(
        "estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento",
      ),
    ).toBeInTheDocument()
  })

  it("test_comprovantes_lista_e_remove", async () => {
    const onArquivosChange = vi.fn()
    const user = userEvent.setup()
    const arquivo = new File(["conteudo"], "recibo.pdf", { type: "application/pdf" })
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial()}
        arquivos={[arquivo]}
        onArquivosChange={onArquivosChange}
      />,
    )
    expect(screen.getByText("recibo.pdf")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Remover" }))
    expect(onArquivosChange).toHaveBeenCalledWith([])
  })

  it("test_sem_onArquivosChange_nao_ha_picker", () => {
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial()} />)
    expect(screen.queryByText("Comprovantes")).not.toBeInTheDocument()
  })
})

describe("PaymentForm — restyle do modal compacto (Final, #87)", () => {
  it("test_valor_pago_com_prefixo_rs", () => {
    render(
      <PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial()} competenciaOculta />,
    )
    expect(screen.getByLabelText("Valor pago")).toHaveValue("129,90")
    expect(screen.getByText("R$")).toBeInTheDocument()
  })

  it("test_label_valor_padrao_fora_do_compacto", () => {
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial()} />)
    expect(screen.getByLabelText("Valor")).toBeInTheDocument()
    expect(screen.queryByText("R$")).not.toBeInTheDocument()
  })

  it("test_pago_por_dois_botoes_estilo_prototipo", () => {
    render(
      <PaymentForm
        formAction={noop}
        pessoas={PESSOAS}
        inicial={inicial({ paidBy: "p-1" })}
        competenciaOculta
      />,
    )
    expect(screen.getByText("Pago por")).toBeInTheDocument()
    const selecionado = screen.getByRole("button", { name: "Thiago" })
    const naoSelecionado = screen.getByRole("button", { name: "Jakeline" })
    expect(selecionado.className).toContain("border-luc-accent")
    expect(selecionado.className).toContain("bg-luc-accent-06")
    expect(naoSelecionado.className).not.toContain("bg-luc-accent-06")
  })

  it("test_quem_pagou_mantem_rotulo_e_estilo_fora_do_compacto", () => {
    render(<PaymentForm formAction={noop} pessoas={PESSOAS} inicial={inicial()} />)
    expect(screen.getByText("Quem pagou")).toBeInTheDocument()
    expect(screen.queryByText("Pago por")).not.toBeInTheDocument()
  })
})
