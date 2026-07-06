// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import type { BillFormInicial } from "./bill-form-inicial"
import { EditarContaModal } from "./EditarContaModal"

// next/navigation não tem router montado nos testes — mockamos o mínimo (o X e o
// picker de logo usam `useRouter`). A navegação em si é do Next, não deste seam.
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/areas/financas/pagamentos-recorrentes",
}))

// As actions reais são "use server" e arrastam @/auth (next-auth) — fora do
// jsdom. O `BillLogoPicker` importa as actions de logo; mockamos o suficiente.
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararLogoConta: vi.fn(),
  confirmarLogoConta: vi.fn(),
  removerLogoConta: vi.fn(),
}))

afterEach(() => {
  cleanup()
  replace.mockClear()
})

const CLOSE = "/areas/financas/pagamentos-recorrentes"

function renderModal(
  inicial: Partial<BillFormInicial> = {},
  action: (prev: ContaFormState, fd: FormData) => Promise<ContaFormState> = async () => ({
    erros: [],
  }),
  logoUrl: string | null = null,
) {
  return render(
    <EditarContaModal
      billId="luz"
      billName="Luz"
      billIcon="zap"
      logoUrl={logoUrl}
      contexto="recorrência mensal · o valor nasce em cada Lançamento"
      inicial={{
        nome: "Luz",
        descricao: "Energia do apartamento",
        icon: "zap",
        intervalMonths: "1",
        anchorMonth: "",
        dueRuleKind: "dia-fixo",
        dueRuleDay: "10",
        dueRuleNth: "5",
        dueMonthOffset: "0",
        ...inicial,
      }}
      action={action}
      closeHref={CLOSE}
    />,
  )
}

describe("EditarContaModal (#97)", () => {
  it("test_modal_compacto_preenchido_no_cartao_do_prototipo", () => {
    renderModal()
    // diálogo rotulado pelo nome da Conta + rótulo da edição
    expect(screen.getByRole("dialog", { name: "Luz" })).toBeInTheDocument()
    expect(screen.getByText("Editar Conta")).toBeInTheDocument()
    // contexto mono do header (Final): a recorrência + o invariante do valor
    expect(
      screen.getByText("recorrência mensal · o valor nasce em cada Lançamento"),
    ).toBeInTheDocument()
    // preenchido com o estado atual
    expect(screen.getByLabelText("Nome")).toHaveValue("Luz")
    expect(screen.getByLabelText("Dia do mês")).toHaveValue(10)
    // cartão do protótipo: até 400px, central com margem, overlay com blur leve
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveClass("max-w-[400px]")
    expect(dialog).toHaveClass("max-h-[calc(100dvh-40px)]")
    expect(screen.getByLabelText("Fechar diálogo")).toHaveClass("backdrop-blur-[3px]")
  })

  it("test_edicao_expoe_os_campos_editaveis_sem_offset", () => {
    renderModal()
    expect(screen.getByLabelText("Descrição (opcional)")).toHaveValue("Energia do apartamento")
    expect(screen.getByLabelText("Periodicidade")).toHaveValue("1")
    expect(screen.getByText("Dia fixo")).toBeInTheDocument()
    expect(screen.getByText("N-ésimo dia útil")).toBeInTheDocument()
    expect(screen.getByText("Último dia útil")).toBeInTheDocument()
    expect(screen.queryByLabelText("Offset de vencimento")).not.toBeInTheDocument()
  })

  it("test_regra_avancada_abre_editavel_sem_segmento_manter", () => {
    renderModal({ dueRuleKind: "n-esimo-dia-util", dueRuleNth: "7" })
    expect(screen.getByRole("radio", { name: "N-ésimo dia útil" })).toBeChecked()
    expect(screen.getByLabelText("Dia útil nº")).toHaveValue(7)
    expect(screen.queryByText(/Manter regra atual/)).not.toBeInTheDocument()
  })

  it("test_logo_reutiliza_o_picker_existente", () => {
    // Conta sem logo: o CTA tracejado do protótipo oferece enviar (progresso/
    // recuperação seguem do picker)
    renderModal()
    expect(screen.getByRole("button", { name: /Enviar um logo/ })).toBeInTheDocument()
  })

  it("test_conta_com_logo_mantem_icone_fallback_editavel_no_disclosure", async () => {
    const user = userEvent.setup()
    renderModal({}, undefined, "https://r2.example/logo.png")
    await user.click(screen.getByRole("button", { name: "Energia" }))
    expect(screen.getByRole("radio", { name: "Energia" })).toBeChecked()
    expect(screen.getByRole("button", { name: /Trocar o logo/ })).toBeInTheDocument()
  })

  it("test_fechar_dispensa_o_modal_via_replace", async () => {
    // dismissal de modal usa replace (não push): o Back não reabre o overlay.
    // O Final não tem Cancelar — o X é a única saída deliberada.
    const user = userEvent.setup()
    renderModal()
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Fechar" }))
    expect(replace).toHaveBeenCalledWith(CLOSE, { scroll: false })
  })

  it("test_submeter_dispara_a_action_da_edicao", async () => {
    const user = userEvent.setup()
    const action = vi.fn(async (): Promise<ContaFormState> => ({ erros: [] }))
    renderModal({}, action)
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))
    expect(action).toHaveBeenCalled()
  })
})
