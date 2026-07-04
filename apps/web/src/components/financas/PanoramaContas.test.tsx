// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { type BlocoPanorama, PanoramaContas } from "./PanoramaContas"

afterEach(cleanup)

/** Bloco em aberto (vence em breve, estimativa) — base que cada teste muta. */
function bloco(over: Partial<BlocoPanorama> = {}): BlocoPanorama {
  return {
    billId: "luz",
    nome: "Luz",
    icon: "zap",
    logoUrl: null,
    estado: "vence-em-breve",
    frase: "vence em 2 dias",
    valor: { estado: "estimativa", media: 5000 },
    registrarHref: "/areas/financas/pagamentos-recorrentes/luz?registrar=1&competencia=2026-07",
    ...over,
  }
}

describe("PanoramaContas (Seam 2)", () => {
  it("test_sem_contador_de_quitadas_e_bloco_pago_sem_botao", () => {
    render(
      <PanoramaContas
        blocos={[
          bloco({
            billId: "agua",
            nome: "Água",
            estado: "pago",
            frase: "pago em 02/07",
            valor: { estado: "pago", total: 12345 },
            registrarHref: null,
          }),
          bloco(),
        ]}
      />,
    )
    expect(screen.queryByText(/de 2 Contas quitada/)).not.toBeInTheDocument()
    expect(screen.getByText("R$ 123,45")).toBeInTheDocument()
    expect(screen.getByText("pago em 02/07")).toBeInTheDocument()
    // paga não tem o que registrar: um único CTA, o do bloco em aberto
    expect(screen.getAllByRole("link", { name: "Registrar pagamento" })).toHaveLength(1)
  })

  it("test_bloco_em_aberto_estimativa_prefixada_com_cta_de_baixa", () => {
    render(<PanoramaContas blocos={[bloco()]} />)
    expect(screen.getByText("≈ R$ 50,00")).toBeInTheDocument()
    expect(screen.getByText("· valor estimado")).toBeInTheDocument()
    expect(screen.getByText("vence em breve")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Registrar pagamento" })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/luz?registrar=1&competencia=2026-07",
    )
  })

  it("test_ausencia_sem_historico_nao_inventa_valor", () => {
    render(<PanoramaContas blocos={[bloco({ valor: { estado: "ausente" } })]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getByText("· sem histórico")).toBeInTheDocument()
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()
  })

  it("test_bloco_vencida_veste_danger", () => {
    render(<PanoramaContas blocos={[bloco({ estado: "vencida", frase: "venceu há 2 dias" })]} />)
    const pilula = screen.getByLabelText("Conta vencida")
    expect(pilula).toHaveAttribute("data-tone", "danger")
    expect(screen.getByText("vencida")).toBeInTheDocument()
  })

  it("test_sem_ocorrencias_no_mes_mensagem_honesta", () => {
    render(<PanoramaContas blocos={[]} />)
    expect(screen.getByText("Nenhuma Conta com ocorrência neste mês.")).toBeInTheDocument()
  })
})
