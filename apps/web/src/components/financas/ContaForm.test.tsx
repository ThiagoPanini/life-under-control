// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ContaForm } from "./ContaForm"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararLogoConta: vi.fn(),
  confirmarLogoConta: vi.fn(),
  removerLogoConta: vi.fn(),
}))

const noop = () => {}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe("ContaForm — formulário gêmeo de tela única", () => {
  it("test_exibe_todos_os_grupos_sem_navegacao_de_passos", () => {
    render(<ContaForm mode="create" formAction={noop} logoFile={null} onLogoFileChange={noop} />)

    expect(screen.getByRole("heading", { name: "Identidade" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Recorrência" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Vencimento" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Identidade visual" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Próximo/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cadastrar Conta" })).toBeInTheDocument()
  })

  it("test_disclosure_exibe_os_17_icones_e_fecha_ao_escolher", async () => {
    const user = userEvent.setup()
    render(<ContaForm mode="create" formAction={noop} logoFile={null} onLogoFileChange={noop} />)

    const trigger = screen.getByRole("button", { name: /Escolher ícone/ })
    expect(trigger).toHaveAttribute("aria-expanded", "false")

    await user.click(trigger)
    const grade = screen.getByRole("group", { name: "Opções de ícone" })
    expect(within(grade).getAllByRole("radio")).toHaveLength(17)

    await user.click(within(grade).getByRole("radio", { name: "Internet" }))
    expect(screen.queryByRole("group", { name: "Opções de ícone" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Internet/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })

  it("test_edicao_expoe_todos_os_campos_preenchidos_incluindo_n_esimo_dia_util", () => {
    const { container } = render(
      <ContaForm
        mode="edit"
        formAction={noop}
        billId="bill-1"
        logoUrl={null}
        inicial={{
          nome: "Internet Fibra",
          descricao: "300 mega",
          icon: "wifi",
          intervalMonths: "12",
          anchorMonth: "3",
          dueRuleKind: "n-esimo-dia-util",
          dueRuleDay: "10",
          dueRuleNth: "5",
          dueMonthOffset: "1",
        }}
      />,
    )

    expect(screen.getByLabelText("Nome")).toHaveValue("Internet Fibra")
    expect(screen.getByLabelText("Descrição (opcional)")).toHaveValue("300 mega")
    expect(screen.getByLabelText("Periodicidade")).toHaveValue("12")
    expect(screen.getByLabelText("Mês-âncora")).toHaveValue("3")
    expect(screen.getByRole("radio", { name: "N-ésimo dia útil" })).toBeChecked()
    expect(screen.getByLabelText("Dia útil nº")).toHaveValue(5)
    expect(screen.queryByLabelText("Offset de vencimento")).not.toBeInTheDocument()
    expect(container.querySelector('input[name="dueMonthOffset"]')).toHaveValue("1")
    expect(screen.queryByLabelText(/primeira competência/i)).not.toBeInTheDocument()
  })

  it("test_campos_condicionais_acompanham_recorrencia_e_forma_de_vencimento", async () => {
    const user = userEvent.setup()
    render(<ContaForm mode="create" formAction={noop} logoFile={null} onLogoFileChange={noop} />)

    expect(screen.queryByLabelText("Mês-âncora")).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Periodicidade"), "12")
    expect(screen.getByLabelText("Mês-âncora")).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: "N-ésimo dia útil" }))
    expect(screen.getByLabelText("Dia útil nº")).toBeInTheDocument()
    expect(screen.queryByLabelText("Dia do mês")).not.toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: "Último dia útil" }))
    expect(screen.queryByLabelText("Dia útil nº")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Dia do mês")).not.toBeInTheDocument()
  })

  it("test_periodicidade_abre_com_opcoes_legiveis_no_tema_escuro", () => {
    render(<ContaForm mode="create" formAction={noop} logoFile={null} onLogoFileChange={noop} />)

    const periodicidade = screen.getByLabelText("Periodicidade")
    expect(periodicidade).toHaveClass("[color-scheme:dark]")
    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveClass("bg-luc-surface-3", "text-luc-text")
    }
  })

  it("test_opcoes_de_periodicidade_e_forma_usam_a_mesma_tipografia", () => {
    render(<ContaForm mode="create" formAction={noop} logoFile={null} onLogoFileChange={noop} />)

    const periodicidade = screen.getByLabelText("Periodicidade")
    const diaFixo = screen.getByRole("radio", { name: "Dia fixo" }).closest("label")
    expect(periodicidade).toHaveClass("font-sans", "text-[14px]", "font-medium")
    expect(diaFixo).toHaveClass("font-sans", "text-[14px]", "font-medium")
  })

  it("test_erro_do_servidor_foca_o_primeiro_campo_invalido", () => {
    render(
      <ContaForm
        mode="create"
        formAction={noop}
        logoFile={null}
        onLogoFileChange={noop}
        erros={[{ campo: "nome", mensagem: "Dê um nome à Conta." }]}
      />,
    )

    expect(screen.getByText("Dê um nome à Conta.")).toBeInTheDocument()
    expect(screen.getByLabelText("Nome")).toHaveFocus()
  })

  it("test_icone_escolhido_e_enviado_no_formulario", async () => {
    const user = userEvent.setup()
    const formAction = vi.fn()
    render(
      <ContaForm mode="create" formAction={formAction} logoFile={null} onLogoFileChange={noop} />,
    )

    await user.click(screen.getByRole("button", { name: /Escolher ícone/ }))
    await user.click(screen.getByRole("radio", { name: "Internet" }))
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))

    const formData = formAction.mock.calls[0]?.[0] as FormData
    expect(formData.get("icon")).toBe("wifi")
  })

  it("test_toggle_inicia_em_icone_no_cadastro_e_troca_para_logo", async () => {
    const user = userEvent.setup()
    render(<ContaForm mode="create" formAction={noop} logoFile={null} onLogoFileChange={noop} />)

    expect(screen.getByRole("button", { name: "Ícone padrão" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: /Escolher ícone/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Logo customizado" }))

    expect(screen.getByRole("button", { name: "Logo customizado" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.queryByRole("button", { name: /Escolher ícone/ })).not.toBeInTheDocument()
    expect(
      screen.getByText("O arquivo só será enviado depois que a Conta existir."),
    ).toBeInTheDocument()
  })

  it("test_edicao_com_logo_inicia_no_modo_logo", () => {
    render(
      <ContaForm
        mode="edit"
        formAction={noop}
        billId="bill-1"
        logoUrl="https://r2.fake/logo"
        inicial={{
          nome: "Luz",
          descricao: "",
          icon: "zap",
          intervalMonths: "1",
          anchorMonth: "",
          dueRuleKind: "dia-fixo",
          dueRuleDay: "10",
          dueRuleNth: "5",
          dueMonthOffset: "0",
        }}
      />,
    )

    expect(screen.getByRole("button", { name: "Logo customizado" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.queryByRole("button", { name: /Escolher ícone/ })).not.toBeInTheDocument()
  })

  it("test_modo_logo_no_cadastro_envia_o_icone_neutro", async () => {
    const user = userEvent.setup()
    const formAction = vi.fn()
    render(
      <ContaForm mode="create" formAction={formAction} logoFile={null} onLogoFileChange={noop} />,
    )

    await user.click(screen.getByRole("button", { name: "Logo customizado" }))
    await user.click(screen.getByRole("button", { name: "Cadastrar Conta" }))

    const formData = formAction.mock.calls[0]?.[0] as FormData
    expect(formData.get("icon")).toBe("receipt")
  })

  it("test_modo_logo_na_edicao_preserva_o_icone_atual", async () => {
    const user = userEvent.setup()
    const formAction = vi.fn()
    render(
      <ContaForm
        mode="edit"
        formAction={formAction}
        billId="bill-1"
        logoUrl="https://r2.fake/logo"
        inicial={{
          nome: "Luz",
          descricao: "",
          icon: "zap",
          intervalMonths: "1",
          anchorMonth: "",
          dueRuleKind: "dia-fixo",
          dueRuleDay: "10",
          dueRuleNth: "5",
          dueMonthOffset: "0",
        }}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))

    const formData = formAction.mock.calls[0]?.[0] as FormData
    expect(formData.get("icon")).toBe("zap")
  })
})
