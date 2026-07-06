// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PaymentFormState } from "@/app/(app)/areas/financas/actions"
import { confirmarComprovante, prepararComprovante } from "@/app/(app)/areas/financas/actions"
import { ConnectedPaymentForm } from "./ConnectedPaymentForm"

// O router não está montado no teste — o fechar/redirect do fluxo é um
// router.replace; espionamos replace/refresh.
const replace = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}))

// As Server Actions de comprovante arrastam @/auth (next-auth), fora do jsdom.
// O seam aqui é a orquestração no cliente: upload em duas etapas, falha parcial,
// retry só dos falhos, contagem de associados e o momento do fechamento.
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararComprovante: vi.fn(),
  confirmarComprovante: vi.fn(),
}))

const prepararMock = vi.mocked(prepararComprovante)
const confirmarMock = vi.mocked(confirmarComprovante)

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

const SUCESSO: PaymentFormState = {
  erros: [],
  createdPaymentId: "pay-1",
  competencia: "2026-07",
  valor: 12000,
}

const SUCCESS_HREF = "/areas/financas/pagamentos-recorrentes?lancadoConta=luz"

function arquivo(nome: string): File {
  return new File(["x"], nome, { type: "application/pdf" })
}

function renderForm(
  action: (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState> = vi.fn(
    async () => SUCESSO,
  ),
) {
  const utils = render(
    <ConnectedPaymentForm
      action={action}
      pessoas={PESSOAS}
      inicial={{
        valor: "120,00",
        dataPagamento: "2026-07-09",
        competencia: "2026-07",
        paidBy: "p-1",
      }}
      competenciasComLancamento={[]}
      compacto
      billId="luz"
      successHref={SUCCESS_HREF}
      closeHref="/areas/financas/pagamentos-recorrentes"
    />,
  )
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  return { action, input, ...utils }
}

async function submeter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))
}

function ultimaUrl(): string {
  return replace.mock.calls.at(-1)?.[0] as string
}

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
  refresh.mockClear()
  vi.unstubAllGlobals()
})

describe("ConnectedPaymentForm — orquestração da baixa compacta (#100)", () => {
  it("test_seletor_aceita_multiplos_comprovantes", async () => {
    const user = userEvent.setup()
    const { input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf")])

    expect(screen.getByText("a.pdf")).toBeInTheDocument()
    expect(screen.getByText("b.pdf")).toBeInTheDocument()
  })

  it("test_sucesso_integral_fecha_com_valor_e_contagem", async () => {
    prepararMock.mockResolvedValue({ ok: true, attachmentId: "att", uploadUrl: "https://r2/put" })
    confirmarMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const { input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf")])
    await submeter(user)

    await waitFor(() => expect(replace).toHaveBeenCalled())
    const url = ultimaUrl()
    expect(url).toContain("lancado=2026-07")
    expect(url).toContain("valor=12000")
    expect(url).toContain("comprovantes=2")
  })

  it("test_lancamento_criado_uma_vez_apesar_de_varios_uploads", async () => {
    prepararMock.mockResolvedValue({ ok: true, attachmentId: "att", uploadUrl: "https://r2/put" })
    confirmarMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const { action, input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf"), arquivo("c.pdf")])
    await submeter(user)

    await waitFor(() => expect(replace).toHaveBeenCalled())
    // o Lançamento nasce de UM submit; os uploads não o recriam
    expect(action).toHaveBeenCalledOnce()
    expect(prepararMock).toHaveBeenCalledTimes(3)
  })

  it("test_sem_anexos_registra_e_fecha_sem_comprovantes", async () => {
    const user = userEvent.setup()
    renderForm()

    await submeter(user)

    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(ultimaUrl()).toContain("comprovantes=0")
    expect(prepararMock).not.toHaveBeenCalled()
  })

  it("test_falha_parcial_mostra_erro_e_nao_fecha", async () => {
    prepararMock.mockResolvedValue({ ok: true, attachmentId: "att", uploadUrl: "https://r2/put" })
    confirmarMock.mockImplementation(async (_billId, _paymentId, _attachmentId, nome) =>
      nome === "b.pdf" ? { ok: false, erro: "falhou" } : { ok: true },
    )
    const user = userEvent.setup()
    const { input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf")])
    await submeter(user)

    await screen.findByText(/comprovante não foi enviado/i)
    // o modal NÃO se fecha numa falha parcial — o Lançamento fica salvo, decisão explícita
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByText(/O Lançamento já está registrado/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Continuar sem comprovante" })).toBeInTheDocument()
  })

  it("test_retry_reenvia_so_os_falhos_sem_recriar_o_lancamento", async () => {
    prepararMock.mockResolvedValue({ ok: true, attachmentId: "att", uploadUrl: "https://r2/put" })
    let tentativasB = 0
    confirmarMock.mockImplementation(async (_billId, _paymentId, _attachmentId, nome) => {
      if (nome === "b.pdf") {
        tentativasB += 1
        return tentativasB === 1 ? { ok: false, erro: "falhou" } : { ok: true }
      }
      return { ok: true }
    })
    const user = userEvent.setup()
    const { action, input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf")])
    await submeter(user)
    await screen.findByText(/comprovante não foi enviado/i)

    prepararMock.mockClear()
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))

    await waitFor(() => expect(replace).toHaveBeenCalled())
    // só o falho é reenviado
    expect(prepararMock).toHaveBeenCalledTimes(1)
    expect(prepararMock).toHaveBeenCalledWith(
      "pay-1",
      expect.objectContaining({ nomeOriginal: "b.pdf" }),
    )
    // o Lançamento não é recriado no retry
    expect(action).toHaveBeenCalledOnce()
    // a contagem soma os dois sucessos (a na 1ª rodada + b no retry)
    expect(ultimaUrl()).toContain("comprovantes=2")
  })

  it("test_falha_no_preparo_nao_conta_o_comprovante", async () => {
    // O falho é no prepararComprovante (não no confirmar) — outro braço do try.
    prepararMock.mockImplementation(async (_paymentId, dados) =>
      dados.nomeOriginal === "b.pdf"
        ? { ok: false, erro: "preparo falhou" }
        : { ok: true, attachmentId: "att", uploadUrl: "https://r2/put" },
    )
    confirmarMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const { input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf")])
    await submeter(user)
    await screen.findByText(/comprovante não foi enviado/i)

    await user.click(screen.getByRole("button", { name: "Continuar sem comprovante" }))
    await waitFor(() => expect(replace).toHaveBeenCalled())
    // b caiu no preparo — não entra na contagem de associados
    expect(ultimaUrl()).toContain("comprovantes=1")
  })

  it("test_falha_no_upload_nao_conta_o_comprovante", async () => {
    // O falho é no PUT (fetch), o terceiro braço — prepara e confirma ok.
    prepararMock.mockImplementation(async (_paymentId, dados) => ({
      ok: true,
      attachmentId: dados.nomeOriginal,
      uploadUrl: `https://r2/put/${dados.nomeOriginal}`,
    }))
    confirmarMock.mockResolvedValue({ ok: true })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({ ok: !String(url).endsWith("b.pdf") }) as Response),
    )
    const user = userEvent.setup()
    const { input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf")])
    await submeter(user)
    await screen.findByText(/comprovante não foi enviado/i)

    await user.click(screen.getByRole("button", { name: "Continuar sem comprovante" }))
    await waitFor(() => expect(replace).toHaveBeenCalled())
    // b falhou no envio — não entra na contagem
    expect(ultimaUrl()).toContain("comprovantes=1")
  })

  it("test_sucesso_persiste_quando_competencia_passa_a_constar_no_aviso", async () => {
    // Regressão do "pisca e volta com o aviso": após o registro, o refresh do RSC
    // traz a competência recém-criada para `competenciasComLancamento`. Enquanto a
    // MESMA instância seguir montada (key estável por Conta, não pela contagem de
    // Lançamentos), a tela de sucesso persiste e o aviso de duplicidade NÃO
    // ressurge sobre um Lançamento já gravado.
    const action = vi.fn(async () => SUCESSO)
    const props = {
      action,
      pessoas: PESSOAS,
      inicial: {
        valor: "120,00",
        dataPagamento: "2026-07-09",
        competencia: "2026-07",
        paidBy: "p-1",
      },
      compacto: true,
      billId: "luz",
      successHref: SUCCESS_HREF,
      closeHref: "/areas/financas/pagamentos-recorrentes",
    }
    const user = userEvent.setup()
    const { rerender } = render(<ConnectedPaymentForm {...props} competenciasComLancamento={[]} />)

    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }))
    expect(await screen.findByText("Lançamento registrado")).toBeInTheDocument()

    // o refresh re-renderiza a MESMA instância com a competência já lançada
    rerender(<ConnectedPaymentForm {...props} competenciasComLancamento={["2026-07"]} />)

    expect(screen.getByText("Lançamento registrado")).toBeInTheDocument()
    expect(screen.queryByText(/Já existe um Lançamento nesta competência/)).not.toBeInTheDocument()
  })

  it("test_continuar_sem_comprovante_fecha_marcando_so_os_enviados", async () => {
    prepararMock.mockResolvedValue({ ok: true, attachmentId: "att", uploadUrl: "https://r2/put" })
    confirmarMock.mockImplementation(async (_billId, _paymentId, _attachmentId, nome) =>
      nome === "b.pdf" ? { ok: false, erro: "falhou" } : { ok: true },
    )
    const user = userEvent.setup()
    const { action, input } = renderForm()

    await user.upload(input, [arquivo("a.pdf"), arquivo("b.pdf")])
    await submeter(user)
    await screen.findByText(/comprovante não foi enviado/i)

    await user.click(screen.getByRole("button", { name: "Continuar sem comprovante" }))

    await waitFor(() => expect(replace).toHaveBeenCalled())
    const url = ultimaUrl()
    expect(url).toContain("valor=12000")
    expect(url).toContain("comprovantes=1") // só o que de fato subiu
    expect(action).toHaveBeenCalledOnce()
  })
})
