// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BillForm } from "./BillForm"

/**
 * Seam 3: a lógica de borda do wizard — passos, campos condicionais e exibição
 * de erro. A validação-fonte é do núcleo (testada no Seam 1); aqui só o
 * comportamento da interface, com um `formAction` falso.
 */
const noop = () => {}

afterEach(cleanup)

describe("BillForm — Recorrência (Seam 3)", () => {
  it("test_ancora_so_aparece_quando_intervalo_maior_que_um", async () => {
    const user = userEvent.setup()
    render(<BillForm formAction={noop} />)

    // avança da Identidade para a Recorrência
    await user.click(screen.getByRole("button", { name: "Próximo →" }))

    // mensal (default) não pede âncora
    expect(screen.queryByLabelText("Mês-âncora")).toBeNull()

    // ao virar anual, a âncora aparece
    await user.selectOptions(screen.getByLabelText("Periodicidade"), "12")
    expect(screen.getByLabelText("Mês-âncora")).toBeInTheDocument()
  })
})

describe("BillForm — Vencimento (Seam 3)", () => {
  async function irParaVencimento() {
    const user = userEvent.setup()
    render(<BillForm formAction={noop} />)
    await user.click(screen.getByRole("button", { name: "Próximo →" }))
    await user.click(screen.getByRole("button", { name: "Próximo →" }))
    return user
  }

  it("test_dia_fixo_mostra_dia_do_mes", async () => {
    await irParaVencimento()
    expect(screen.getByLabelText("Dia do mês")).toBeInTheDocument()
    expect(screen.queryByLabelText("Dia útil nº")).toBeNull()
  })

  it("test_ultimo_dia_util_nao_pede_parametro", async () => {
    const user = await irParaVencimento()
    await user.click(screen.getByRole("radio", { name: "Último dia útil" }))
    expect(screen.queryByLabelText("Dia do mês")).toBeNull()
    expect(screen.queryByLabelText("Dia útil nº")).toBeNull()
  })

  it("test_n_esimo_dia_util_troca_para_o_campo_de_posicao", async () => {
    const user = await irParaVencimento()
    await user.click(screen.getByRole("radio", { name: "N-ésimo dia útil" }))
    expect(screen.queryByLabelText("Dia do mês")).toBeNull()
    expect(screen.getByLabelText("Dia útil nº")).toBeInTheDocument()
  })
})

describe("BillForm — erros do servidor (Seam 3)", () => {
  it("test_salta_para_o_passo_do_primeiro_erro_e_exibe_mensagem", () => {
    render(
      <BillForm formAction={noop} erros={[{ campo: "nome", mensagem: "Dê um nome à Conta." }]} />,
    )

    // erro no nome (passo 1) → volta ao passo de Identidade e mostra a mensagem
    expect(screen.getByText("Dê um nome à Conta.")).toBeInTheDocument()
    expect(screen.getByLabelText("Nome")).toBeVisible()
  })

  it("test_submeter_no_ultimo_passo_chama_o_action", async () => {
    const formAction = vi.fn()
    const user = userEvent.setup()
    render(<BillForm formAction={formAction} />)

    await user.click(screen.getByRole("button", { name: "Próximo →" }))
    await user.click(screen.getByRole("button", { name: "Próximo →" }))
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))

    expect(formAction).toHaveBeenCalledOnce()
  })
})
