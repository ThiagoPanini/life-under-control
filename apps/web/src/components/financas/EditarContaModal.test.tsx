// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type ContaFormState,
  deletarConta,
  encerrarConta,
  reativarConta,
} from "@/app/(app)/areas/financas/actions"
import type { BillEstado } from "@/core/domain/bill"
import type { DependentesBill } from "@/core/ports/bill-repo"
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
// jsdom. O `BillLogoPicker` importa as actions de logo; o rodapé de ciclo de
// vida importa encerrar/reativar/deletar — mockamos o suficiente de cada uma.
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararLogoConta: vi.fn(),
  confirmarLogoConta: vi.fn(),
  removerLogoConta: vi.fn(),
  encerrarConta: vi.fn(async () => ({})),
  reativarConta: vi.fn(async () => {}),
  deletarConta: vi.fn(async () => {}),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CLOSE = "/areas/financas/pagamentos-recorrentes"

function renderModal(
  inicial: Partial<BillFormInicial> = {},
  action: (prev: ContaFormState, fd: FormData) => Promise<ContaFormState> = async () => ({
    erros: [],
  }),
  logoUrl: string | null = null,
  ciclo: {
    estado?: BillEstado
    encerradaEm?: string | null
    hoje?: string
    dependentes?: DependentesBill | null
  } = {},
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
      estado={ciclo.estado ?? "ativa"}
      encerradaEm={ciclo.encerradaEm ?? null}
      hoje={ciclo.hoje ?? "2026-07-06"}
      dependentes={
        ciclo.dependentes === undefined ? { lancamentos: 0, anexos: 0 } : ciclo.dependentes
      }
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

  it("test_logo_reutiliza_o_picker_existente_ao_alternar_para_logo", async () => {
    // Conta sem logo abre no modo Ícone (#144); alternar para Logo revela o CTA
    // tracejado do protótipo (progresso/recuperação seguem do picker).
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole("button", { name: "Logo customizado" }))
    expect(screen.getByRole("button", { name: /Enviar um logo/ })).toBeInTheDocument()
  })

  it("test_conta_com_logo_abre_no_modo_logo_e_preserva_o_icone_fallback", async () => {
    // Com logo, o toggle inicia em Logo (CTA "Trocar o logo"); o ícone fallback
    // (Energia/zap) é preservado silenciosamente — reaparece ao voltar pro Ícone.
    const user = userEvent.setup()
    renderModal({}, undefined, "https://r2.example/logo.png")
    expect(screen.getByRole("button", { name: "Logo customizado" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: /Trocar o logo/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Ícone padrão" }))
    expect(screen.getByRole("button", { name: /Energia/ })).toBeInTheDocument()
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

describe("EditarContaModal — ciclo de vida da Conta (#143)", () => {
  it("test_conta_ativa_mostra_encerrar_com_data_default", () => {
    renderModal(undefined, undefined, undefined, { hoje: "2026-07-06" })
    expect(screen.getByRole("button", { name: "Encerrar" })).toBeInTheDocument()
    expect(screen.getByLabelText("Data de encerramento")).toHaveValue("2026-07-06")
    expect(screen.queryByRole("button", { name: "Reativar" })).not.toBeInTheDocument()
  })

  it("test_encerrar_dispara_a_action_de_encerramento", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole("button", { name: "Encerrar" }))
    expect(vi.mocked(encerrarConta)).toHaveBeenCalled()
  })

  it("test_conta_encerrada_mostra_a_data_e_reativar_persistente", () => {
    renderModal(undefined, undefined, undefined, {
      estado: "encerrada",
      encerradaEm: "2026-06-29",
    })
    expect(screen.getByText(/29\/06\/2026/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reativar" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Encerrar" })).not.toBeInTheDocument()
  })

  it("test_reativar_dispara_a_action_de_reativacao", async () => {
    const user = userEvent.setup()
    renderModal(undefined, undefined, undefined, {
      estado: "encerrada",
      encerradaEm: "2026-06-29",
    })
    await user.click(screen.getByRole("button", { name: "Reativar" }))
    expect(vi.mocked(reativarConta)).toHaveBeenCalled()
  })

  it("test_zona_de_risco_mostra_contagem_honesta_de_dependentes", () => {
    renderModal(undefined, undefined, undefined, {
      dependentes: { lancamentos: 3, anexos: 2 },
    })
    expect(
      screen.getByText(
        "Apaga a Conta e tudo ligado a ela: 3 Lançamentos e 2 Anexos. Não dá pra desfazer.",
      ),
    ).toBeInTheDocument()
  })

  it("test_zona_de_risco_omite_o_tipo_zerado_do_aviso", () => {
    // lancamentos>0 com anexos===0 não pode virar "0 Anexos" fabricado no texto
    renderModal(undefined, undefined, undefined, {
      dependentes: { lancamentos: 3, anexos: 0 },
    })
    expect(
      screen.getByText("Apaga a Conta e tudo ligado a ela: 3 Lançamentos. Não dá pra desfazer."),
    ).toBeInTheDocument()
  })

  it("test_contagem_indisponivel_bloqueia_o_armar", () => {
    renderModal(undefined, undefined, undefined, { dependentes: null })
    expect(
      screen.getByText(
        "Não deu pra confirmar o que a exclusão leva junto — recarregue e tente de novo.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Deletar Conta" })).toBeDisabled()
  })

  it("test_mutacao_do_rodape_trava_o_escape_do_modal", async () => {
    // enquanto o delete está em voo, Escape/backdrop não pode fechar o modal em
    // silêncio (travado precisa cobrir o rodapé, não só o Salvar/logo)
    const user = userEvent.setup()
    vi.mocked(deletarConta).mockImplementation(() => new Promise(() => {}))
    renderModal()
    await user.click(screen.getByRole("button", { name: "Deletar Conta" }))
    await user.click(screen.getByRole("button", { name: "Confirmar exclusão" }))
    await user.keyboard("{Escape}")
    expect(replace).not.toHaveBeenCalled()
  })

  it("test_deletar_exige_armar_antes_de_confirmar", async () => {
    const user = userEvent.setup()
    renderModal()
    expect(screen.queryByRole("button", { name: "Confirmar exclusão" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Deletar Conta" }))
    expect(screen.getByRole("button", { name: "Confirmar exclusão" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByRole("button", { name: "Confirmar exclusão" })).not.toBeInTheDocument()
  })

  it("test_confirmar_exclusao_dispara_a_action_de_delete", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole("button", { name: "Deletar Conta" }))
    await user.click(screen.getByRole("button", { name: "Confirmar exclusão" }))
    expect(vi.mocked(deletarConta)).toHaveBeenCalled()
  })
})
