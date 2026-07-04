// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PaymentFormState } from "@/app/(app)/areas/financas/actions"
import { confirmarComprovante, prepararComprovante } from "@/app/(app)/areas/financas/actions"
import { RegistrarPagamentoModal } from "./RegistrarPagamentoModal"

// next/navigation não tem router montado nos testes — mockamos o mínimo; a
// navegação em si (fechar/redirect) é do Next, não deste seam.
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}))

// O módulo real de actions é "use server" e arrasta @/auth (next-auth) — fora
// do alcance do jsdom. O upload em duas etapas tem o próprio fluxo testado; o
// seam aqui é a composição do modal.
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararComprovante: vi.fn(),
  confirmarComprovante: vi.fn(),
}))

const prepararMock = vi.mocked(prepararComprovante)
const confirmarMock = vi.mocked(confirmarComprovante)

beforeEach(() => {
  prepararMock.mockReset()
  confirmarMock.mockReset()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true }) as Response),
  )
})

afterEach(() => {
  cleanup()
  replace.mockClear()
  vi.unstubAllGlobals()
})

const PESSOAS = [
  {
    id: "p-1",
    nome: "Thiago",
    email: "thiago@x.com",
    googleEmail: null,
    hue: 210,
    inicial: "T",
    avatarKey: null,
    avatarUrl: null,
  },
]

describe("RegistrarPagamentoModal (Seam 2)", () => {
  it("test_modal_compacto_competencia_fixa_nota_e_comprovantes", () => {
    const { container } = render(
      <RegistrarPagamentoModal
        billId="luz"
        billName="Luz"
        billIcon="zap"
        action={async () => ({ erros: [] })}
        pessoas={PESSOAS}
        inicial={{
          valor: "120,00",
          dataPagamento: "2026-07-09",
          competencia: "2026-07",
          paidBy: "p-1",
        }}
        competenciasComLancamento={[]}
        contexto="competência julho de 2026 · vence em 6 dias (18/07)"
        notaValor="estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento"
        closeHref="/areas/financas/pagamentos-recorrentes"
        successHref="/areas/financas/pagamentos-recorrentes?lancadoConta=luz"
      />,
    )

    expect(screen.getByRole("dialog", { name: "Luz" })).toBeInTheDocument()
    expect(screen.getByText("Registrar Lançamento")).toBeInTheDocument()
    expect(
      screen.getByText("competência julho de 2026 · vence em 6 dias (18/07)"),
    ).toBeInTheDocument()

    // chip de ícone 28×28 da Conta no header (Final, #87)
    const chip = container.querySelector("header svg")
    expect(chip).toBeInTheDocument()

    // competência fixa da ocorrência do bloco: hidden, sem campo editável
    expect(screen.queryByLabelText("Competência")).not.toBeInTheDocument()
    const hidden = container.querySelector('input[name="competencia"]')
    expect(hidden).toHaveAttribute("type", "hidden")
    expect(hidden).toHaveValue("2026-07")

    expect(
      screen.getByText(
        "estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Escolher imagens ou PDFs")).toBeInTheDocument()
  })

  it("test_cancelar_navega_para_closeHref", async () => {
    const user = userEvent.setup()
    render(
      <RegistrarPagamentoModal
        billId="luz"
        billName="Luz"
        billIcon="zap"
        action={async () => ({ erros: [] })}
        pessoas={PESSOAS}
        inicial={{
          valor: "120,00",
          dataPagamento: "2026-07-09",
          competencia: "2026-07",
          paidBy: "p-1",
        }}
        competenciasComLancamento={[]}
        contexto="competência julho de 2026 · vence em 6 dias (18/07)"
        closeHref="/areas/financas/pagamentos-recorrentes"
        successHref="/areas/financas/pagamentos-recorrentes?lancadoConta=luz"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(replace).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes", {
      scroll: false,
    })
  })
})

const CLOSE_HREF = "/areas/financas/pagamentos-recorrentes"

function renderModal(
  action: (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState>,
) {
  const utils = render(
    <RegistrarPagamentoModal
      billId="luz"
      billName="Luz"
      billIcon="zap"
      action={action}
      pessoas={PESSOAS}
      inicial={{
        valor: "120,00",
        dataPagamento: "2026-07-09",
        competencia: "2026-07",
        paidBy: "p-1",
      }}
      competenciasComLancamento={[]}
      contexto="competência julho de 2026 · vence em 6 dias (18/07)"
      closeHref={CLOSE_HREF}
      successHref="/areas/financas/pagamentos-recorrentes?lancadoConta=luz"
    />,
  )
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  return { input, ...utils }
}

// Cobre a cadeia inteira da trava (emProgresso → onOperacaoEmAndamento → travado →
// Modal), não cada peça isolada: se a fiação se desconectar, este teste cai.
describe("RegistrarPagamentoModal — trava a operação em andamento (#100, AC13)", () => {
  const SUCESSO: PaymentFormState = {
    erros: [],
    createdPaymentId: "pay-1",
    competencia: "2026-07",
    valor: 12000,
  }

  it("test_falha_parcial_trava_escape_e_backdrop_mas_o_x_fecha", async () => {
    prepararMock.mockResolvedValue({ ok: true, attachmentId: "att", uploadUrl: "https://r2/put" })
    confirmarMock.mockResolvedValue({ ok: false, erro: "falhou" })
    const user = userEvent.setup()
    const { input } = renderModal(async () => SUCESSO)

    await user.upload(input, [new File(["x"], "recibo.pdf", { type: "application/pdf" })])
    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))
    // tela de progresso com falha: operação em andamento (Lançamento salvo, decisão pendente)
    await screen.findByText(/comprovante não foi enviado/i)

    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Fechar diálogo" }))
    // nem Escape nem backdrop descartam silenciosamente
    expect(replace).not.toHaveBeenCalledWith(CLOSE_HREF, { scroll: false })

    // o X rotulado é saída deliberada — segue funcional
    await user.click(screen.getByRole("button", { name: "Fechar" }))
    expect(replace).toHaveBeenCalledWith(CLOSE_HREF, { scroll: false })
  })

  it("test_trava_ja_no_submit_em_voo_antes_do_lancamento_existir", async () => {
    // A criação server-side (criarLancamento) também é operação em andamento:
    // com a ação pendente, Escape não pode descartar o modal.
    let resolver: (s: PaymentFormState) => void = () => {}
    const action = vi.fn(
      () =>
        new Promise<PaymentFormState>((res) => {
          resolver = res
        }),
    )
    const user = userEvent.setup()
    renderModal(action)

    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))
    await user.keyboard("{Escape}")
    expect(replace).not.toHaveBeenCalledWith(CLOSE_HREF, { scroll: false })

    // encerra a ação pendente para não vazar promessa
    await act(async () => resolver({ erros: [] }))
  })
})
