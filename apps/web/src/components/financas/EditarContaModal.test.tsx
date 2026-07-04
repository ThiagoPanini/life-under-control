// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { EditarContaModal } from "./EditarContaModal"
import type { QuickBillInicial } from "./QuickEditBillForm"

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
  inicial: Partial<QuickBillInicial> = {},
  action: (prev: ContaFormState, fd: FormData) => Promise<ContaFormState> = async () => ({
    erros: [],
  }),
) {
  return render(
    <EditarContaModal
      billId="luz"
      billName="Luz"
      billIcon="zap"
      logoUrl={null}
      contexto="recorrência mensal · o valor nasce em cada Lançamento"
      inicial={{ nome: "Luz", icon: "zap", dueRuleKind: "dia-fixo", dueRuleDay: "10", ...inicial }}
      action={action}
      closeHref={CLOSE}
    />,
  )
}

describe("EditarContaModal (#97)", () => {
  it("test_modal_compacto_preenchido_no_cartao_do_prototipo", () => {
    renderModal()
    // diálogo rotulado pelo nome da Conta + rótulo da edição rápida
    expect(screen.getByRole("dialog", { name: "Luz" })).toBeInTheDocument()
    expect(screen.getByText("Editar Conta")).toBeInTheDocument()
    // contexto mono do header (Final): a recorrência + o invariante do valor
    expect(
      screen.getByText("recorrência mensal · o valor nasce em cada Lançamento"),
    ).toBeInTheDocument()
    // preenchido com o estado atual
    expect(screen.getByLabelText("Nome da Conta")).toHaveValue("Luz")
    expect(screen.getByLabelText("todo dia")).toHaveValue(10)
    // cartão do protótipo: até 400px, central com margem, overlay com blur leve
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveClass("max-w-[400px]")
    expect(dialog).toHaveClass("max-h-[calc(100dvh-40px)]")
    expect(screen.getByLabelText("Fechar diálogo")).toHaveClass("backdrop-blur-[3px]")
  })

  it("test_allowlist_nao_expoe_campos_avancados", () => {
    renderModal()
    // o essencial aparece…
    expect(screen.getByText("Dia fixo")).toBeInTheDocument()
    expect(screen.getByText("Último dia útil")).toBeInTheDocument()
    // …e as regras avançadas NÃO: sem periodicidade, descrição, âncora, nth, offset
    expect(screen.queryByLabelText("Periodicidade")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Descrição (opcional)")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Mês-âncora")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Dia útil nº")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Offset de vencimento")).not.toBeInTheDocument()
  })

  it("test_regra_avancada_abre_em_manter_para_preservar_o_n_esimo", () => {
    renderModal({ dueRuleKind: "n-esimo-dia-util" })
    const manter = screen.getByRole("radio", { name: /Manter regra atual/ })
    expect(manter).toBeChecked()
    // em "manter" não há dia a informar — o vencimento avançado fica intocado
    expect(screen.queryByLabelText("todo dia")).not.toBeInTheDocument()
  })

  it("test_logo_reutiliza_o_picker_existente", () => {
    // Conta sem logo: o CTA tracejado do protótipo oferece enviar (progresso/
    // recuperação seguem do picker)
    renderModal()
    expect(screen.getByRole("button", { name: /Enviar um logo/ })).toBeInTheDocument()
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

  it("test_submeter_dispara_a_action_da_edicao_rapida", async () => {
    const user = userEvent.setup()
    const action = vi.fn(async (): Promise<ContaFormState> => ({ erros: [] }))
    renderModal({}, action)
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))
    expect(action).toHaveBeenCalled()
  })
})
