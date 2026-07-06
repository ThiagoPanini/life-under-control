// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NovaContaForm } from "./NovaContaForm"

/**
 * Seam 3: a lógica de borda do form de cadastro de Conta em 2 etapas — Identidade
 * e Recorrência + Vencimento. A validação-fonte é do núcleo (Seam 1); aqui só o
 * comportamento da interface, com um `formAction` falso: as etapas, os reveals
 * condicionais, a grade de ícones só-glifo, a validação inline e o salto para a
 * etapa do 1º campo inválido.
 */
const noop = () => {}

/** Avança da etapa Identidade para a etapa Recorrência + Vencimento. */
async function irParaEtapa2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Próximo →" }))
}

beforeEach(() => {
  // jsdom não implementa scrollIntoView; o form o chama ao focar o 1º inválido.
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe("NovaContaForm — fluxo em 2 etapas (Seam 3)", () => {
  it("test_abre_na_identidade_com_indicador_de_duas_etapas", () => {
    render(<NovaContaForm formAction={noop} />)
    // a 2ª etapa combina Recorrência + Vencimento (texto exclusivo do indicador),
    // e não há passo de Resumo — são só duas etapas
    expect(screen.getByText("Recorrência + Vencimento")).toBeInTheDocument()
    expect(screen.queryByText("Resumo")).toBeNull()
    // etapa 1 visível; etapa 2 ainda escondida
    expect(screen.getByLabelText("Nome")).toBeVisible()
    expect(screen.getByLabelText("Periodicidade")).not.toBeVisible()
  })

  it("test_proximo_revela_recorrencia_e_vencimento", async () => {
    const user = userEvent.setup()
    render(<NovaContaForm formAction={noop} />)
    await irParaEtapa2(user)
    expect(screen.getByLabelText("Periodicidade")).toBeVisible()
    expect(screen.getByRole("group", { name: "Forma de vencimento" })).toBeVisible()
  })

  it("test_voltar_retorna_para_a_identidade", async () => {
    const user = userEvent.setup()
    render(<NovaContaForm formAction={noop} />)
    await irParaEtapa2(user)
    await user.click(screen.getByRole("button", { name: "← Voltar" }))
    expect(screen.getByLabelText("Nome")).toBeVisible()
    expect(screen.getByLabelText("Periodicidade")).not.toBeVisible()
  })
})

describe("NovaContaForm — reveals condicionais na etapa 2 (Seam 3)", () => {
  it("test_ancora_so_quando_periodicidade_maior_que_mensal", async () => {
    const user = userEvent.setup()
    render(<NovaContaForm formAction={noop} />)
    await irParaEtapa2(user)
    expect(screen.queryByLabelText("Mês-âncora")).toBeNull()
    await user.selectOptions(screen.getByLabelText("Periodicidade"), "12")
    expect(screen.getByLabelText("Mês-âncora")).toBeVisible()
  })

  it("test_dia_do_mes_so_em_dia_fixo", async () => {
    const user = userEvent.setup()
    render(<NovaContaForm formAction={noop} />)
    await irParaEtapa2(user)
    // padrão é "dia-fixo"
    expect(screen.getByLabelText("Dia do mês")).toBeVisible()
    expect(screen.queryByLabelText("Dia útil nº")).toBeNull()
  })

  it("test_n_esimo_dia_util_troca_para_dia_util_numero", async () => {
    const user = userEvent.setup()
    render(<NovaContaForm formAction={noop} />)
    await irParaEtapa2(user)
    await user.click(screen.getByRole("radio", { name: "N-ésimo dia útil" }))
    expect(screen.queryByLabelText("Dia do mês")).toBeNull()
    expect(screen.getByLabelText("Dia útil nº")).toBeVisible()
  })

  it("test_ultimo_dia_util_nao_pede_parametro", async () => {
    const user = userEvent.setup()
    render(<NovaContaForm formAction={noop} />)
    await irParaEtapa2(user)
    await user.click(screen.getByRole("radio", { name: "Último dia útil" }))
    expect(screen.queryByLabelText("Dia do mês")).toBeNull()
    expect(screen.queryByLabelText("Dia útil nº")).toBeNull()
  })
})

describe("NovaContaForm — grade de ícones só-glifo (Seam 3)", () => {
  it("test_grade_lista_os_17_icones_acessiveis_por_nome_ptbr", () => {
    render(<NovaContaForm formAction={noop} />)
    // escopo ao grupo "Ícone" — os <select> de periodicidade/offset não têm rádios
    const grade = within(screen.getByRole("group", { name: "Ícone" }))
    // rádios (não <option>): a grade é só-glifo, sem rótulo de texto ao lado
    expect(grade.getAllByRole("radio")).toHaveLength(17)
    // o nome acessível vem do catálogo pt-BR, ainda que o rótulo não seja visível
    expect(grade.getByRole("radio", { name: "Energia" })).toBeInTheDocument()
    expect(grade.getByRole("radio", { name: "Internet" })).toBeInTheDocument()
    expect(grade.getByRole("radio", { name: "Condomínio" })).toBeInTheDocument()
  })

  it("test_selecionar_icone_marca_o_radio_que_sera_submetido", async () => {
    const user = userEvent.setup()
    const { container } = render(<NovaContaForm formAction={noop} />)
    const grade = within(screen.getByRole("group", { name: "Ícone" }))
    await user.click(grade.getByRole("radio", { name: "Energia" }))
    // o valor persistido é o id Lucide, carregado pelo rádio marcado name="icon"
    expect(container.querySelector('input[name="icon"][value="zap"]')).toBeChecked()
  })
})

describe("NovaContaForm — validação e submissão (Seam 3)", () => {
  it("test_erro_inline_por_campo_exibe_mensagem", () => {
    render(
      <NovaContaForm
        formAction={noop}
        erros={[{ campo: "nome", mensagem: "Dê um nome à Conta." }]}
      />,
    )
    expect(screen.getByText("Dê um nome à Conta.")).toBeInTheDocument()
    expect(screen.getByLabelText("Nome")).toBeVisible()
  })

  it("test_erro_na_identidade_foca_o_campo_na_etapa_1", () => {
    render(
      <NovaContaForm
        formAction={noop}
        erros={[{ campo: "nome", mensagem: "Dê um nome à Conta." }]}
      />,
    )
    expect(screen.getByLabelText("Nome")).toHaveFocus()
  })

  it("test_erro_no_vencimento_salta_para_a_etapa_2_e_foca", () => {
    render(
      <NovaContaForm
        formAction={noop}
        erros={[{ campo: "dueRuleDay", mensagem: "Informe o dia do vencimento." }]}
      />,
    )
    // saltou para a etapa 2 (Recorrência + Vencimento) e focou o campo do erro
    expect(screen.getByLabelText("Dia do mês")).toBeVisible()
    expect(screen.getByLabelText("Dia do mês")).toHaveFocus()
  })

  it("test_submeter_na_ultima_etapa_chama_o_action", async () => {
    const formAction = vi.fn()
    const user = userEvent.setup()
    render(<NovaContaForm formAction={formAction} />)
    await irParaEtapa2(user)
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))
    expect(formAction).toHaveBeenCalledOnce()
  })
})
