// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SingleScreenBillForm } from "./SingleScreenBillForm"

/**
 * Seam 3: a lógica de borda do form de tela única de Conta — as três seções numa
 * coluna só, os reveals condicionais, o dropdown de ícone contido, a validação
 * inline e o foco no 1º campo inválido. A validação-fonte é do núcleo (Seam 1);
 * aqui só o comportamento da interface, com um `formAction` falso. Ao contrário do
 * wizard (`BillForm`), não há navegação por passos.
 */
const noop = () => {}

beforeEach(() => {
  // jsdom não implementa scrollIntoView; o form o chama ao focar o 1º inválido.
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe("SingleScreenBillForm — tela única (Seam 3)", () => {
  it("test_as_tres_secoes_aparecem_juntas_sem_passos", () => {
    render(<SingleScreenBillForm formAction={noop} />)
    // sem "Próximo →": tudo numa tela só
    expect(screen.queryByRole("button", { name: "Próximo →" })).toBeNull()
    // um campo de cada seção, visível ao mesmo tempo
    expect(screen.getByLabelText("Nome")).toBeInTheDocument()
    expect(screen.getByLabelText("Periodicidade")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Forma de vencimento" })).toBeInTheDocument()
  })
})

describe("SingleScreenBillForm — reveals condicionais (Seam 3)", () => {
  it("test_ancora_so_quando_periodicidade_maior_que_mensal", async () => {
    const user = userEvent.setup()
    render(<SingleScreenBillForm formAction={noop} />)
    expect(screen.queryByLabelText("Mês-âncora")).toBeNull()
    await user.selectOptions(screen.getByLabelText("Periodicidade"), "12")
    expect(screen.getByLabelText("Mês-âncora")).toBeInTheDocument()
  })

  it("test_dia_do_mes_so_em_dia_fixo", () => {
    render(<SingleScreenBillForm formAction={noop} />)
    // padrão é "dia-fixo"
    expect(screen.getByLabelText("Dia do mês")).toBeInTheDocument()
    expect(screen.queryByLabelText("Dia útil nº")).toBeNull()
  })

  it("test_n_esimo_dia_util_troca_para_dia_util_numero", async () => {
    const user = userEvent.setup()
    render(<SingleScreenBillForm formAction={noop} />)
    await user.click(screen.getByRole("radio", { name: "N-ésimo dia útil" }))
    expect(screen.queryByLabelText("Dia do mês")).toBeNull()
    expect(screen.getByLabelText("Dia útil nº")).toBeInTheDocument()
  })

  it("test_ultimo_dia_util_nao_pede_parametro", async () => {
    const user = userEvent.setup()
    render(<SingleScreenBillForm formAction={noop} />)
    await user.click(screen.getByRole("radio", { name: "Último dia útil" }))
    expect(screen.queryByLabelText("Dia do mês")).toBeNull()
    expect(screen.queryByLabelText("Dia útil nº")).toBeNull()
  })
})

describe("SingleScreenBillForm — dropdown de ícone (Seam 3)", () => {
  it("test_dropdown_lista_os_17_icones_com_rotulos_ptbr", async () => {
    const user = userEvent.setup()
    render(<SingleScreenBillForm formAction={noop} />)
    await user.click(screen.getByRole("button", { name: /ícone/i }))
    // escopo ao listbox do dropdown — os <option> nativos dos <select> também têm role "option"
    const listbox = within(screen.getByRole("listbox", { name: "Ícones" }))
    expect(listbox.getAllByRole("option")).toHaveLength(17)
    // rótulos pt-BR do catálogo (não os ids Lucide)
    expect(listbox.getByRole("option", { name: "Energia" })).toBeInTheDocument()
    expect(listbox.getByRole("option", { name: "Internet" })).toBeInTheDocument()
    expect(listbox.getByRole("option", { name: "Condomínio" })).toBeInTheDocument()
  })

  it("test_setas_percorrem_as_opcoes_com_roving_focus", async () => {
    const user = userEvent.setup()
    render(<SingleScreenBillForm formAction={noop} />)
    await user.click(screen.getByRole("button", { name: /ícone/i }))
    const opcoes = within(screen.getByRole("listbox", { name: "Ícones" })).getAllByRole("option")
    // sem ícone escolhido, o foco abre na 1ª opção
    expect(opcoes[0]).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(opcoes[1]).toHaveFocus()
    await user.keyboard("{Home}")
    expect(opcoes[0]).toHaveFocus()
    await user.keyboard("{End}")
    expect(opcoes[opcoes.length - 1]).toHaveFocus()
  })

  it("test_selecionar_icone_preenche_o_campo_oculto", async () => {
    const user = userEvent.setup()
    const { container } = render(<SingleScreenBillForm formAction={noop} />)
    await user.click(screen.getByRole("button", { name: /ícone/i }))
    await user.click(screen.getByRole("option", { name: "Energia" }))
    // o valor persistido é o id Lucide, carregado por input hidden name="icon"
    expect(container.querySelector('input[name="icon"]')).toHaveValue("zap")
  })
})

describe("SingleScreenBillForm — validação e submissão (Seam 3)", () => {
  it("test_erro_inline_por_campo_exibe_mensagem", () => {
    render(
      <SingleScreenBillForm
        formAction={noop}
        erros={[{ campo: "nome", mensagem: "Dê um nome à Conta." }]}
      />,
    )
    expect(screen.getByText("Dê um nome à Conta.")).toBeInTheDocument()
    expect(screen.getByLabelText("Nome")).toBeVisible()
  })

  it("test_submissao_com_erro_foca_o_primeiro_campo_invalido", () => {
    render(
      <SingleScreenBillForm
        formAction={noop}
        erros={[{ campo: "nome", mensagem: "Dê um nome à Conta." }]}
      />,
    )
    expect(screen.getByLabelText("Nome")).toHaveFocus()
  })

  it("test_submeter_chama_o_action_sem_navegar_por_passos", async () => {
    const formAction = vi.fn()
    const user = userEvent.setup()
    render(<SingleScreenBillForm formAction={formAction} />)
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))
    expect(formAction).toHaveBeenCalledOnce()
  })
})
