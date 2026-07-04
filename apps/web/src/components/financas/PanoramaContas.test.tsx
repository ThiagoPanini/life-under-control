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
    editarHref: "/areas/financas/pagamentos-recorrentes?editar=luz",
    excluirHref: "/areas/financas/pagamentos-recorrentes?excluir=luz",
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
    expect(screen.getByText("≈ R$ 50")).toBeInTheDocument()
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

describe("PanoramaContas — editar pelo card (#97)", () => {
  it("test_cada_card_expoe_editar_com_nome_acessivel_foco_e_alvo_seguro", () => {
    render(<PanoramaContas blocos={[bloco()]} />)
    // nome acessível (não só um ícone mudo) e destino da edição rápida
    const editar = screen.getByRole("link", { name: "Editar Luz" })
    expect(editar).toHaveAttribute("href", "/areas/financas/pagamentos-recorrentes?editar=luz")
    // foco visível + alvo de toque seguro: box visual 27px do protótipo com
    // área de toque expandida (~37px) via pseudo-elemento
    expect(editar).toHaveClass("focus-visible:ring-2")
    expect(editar).toHaveClass("h-[27px]")
    expect(editar).toHaveClass("w-[27px]")
    expect(editar).toHaveClass("before:-inset-[5px]")
  })

  it("test_bloco_pago_ainda_pode_ser_editado", () => {
    // paga não tem baixa a registrar, mas segue editável (nome, ícone, vencimento)
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
            editarHref: "/areas/financas/pagamentos-recorrentes?editar=agua",
          }),
        ]}
      />,
    )
    expect(screen.queryByRole("link", { name: "Registrar pagamento" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Editar Água" })).toBeInTheDocument()
  })
})

describe("PanoramaContas — excluir pelo card (#99)", () => {
  it("test_cada_card_expoe_excluir_com_nome_acessivel_foco_e_alvo_seguro", () => {
    render(<PanoramaContas blocos={[bloco()]} />)
    // nome acessível distinto (não confunde com Editar) e destino da confirmação
    const excluir = screen.getByRole("link", { name: "Excluir Luz" })
    expect(excluir).toHaveAttribute("href", "/areas/financas/pagamentos-recorrentes?excluir=luz")
    // foco visível + alvo de toque seguro, no mesmo box 27px do protótipo
    expect(excluir).toHaveClass("focus-visible:ring-2")
    expect(excluir).toHaveClass("h-[27px]")
    expect(excluir).toHaveClass("w-[27px]")
    expect(excluir).toHaveClass("before:-inset-[5px]")
  })

  it("test_bloco_pago_ainda_pode_ser_excluido", () => {
    // paga sai da operação como qualquer outra: o gesto de excluir segue presente
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
            excluirHref: "/areas/financas/pagamentos-recorrentes?excluir=agua",
          }),
        ]}
      />,
    )
    expect(screen.getByRole("link", { name: "Excluir Água" })).toBeInTheDocument()
  })
})

describe("PanoramaContas restyle Final (#95)", () => {
  it("test_bloco_interativo_muda_borda_e_superficie_no_hover", () => {
    render(<PanoramaContas blocos={[bloco()]} />)
    const card = screen.getByTestId("bloco-panorama")
    // Interação perceptível por borda + superfície (não só cor): borda mais forte
    // e superfície elevada no hover.
    expect(card).toHaveClass("hover:border-luc-border-strong")
    expect(card).toHaveClass("hover:bg-luc-surface-3")
  })

  it("test_bloco_pago_atenuado_em_repouso_recupera_contraste_no_hover", () => {
    render(
      <PanoramaContas
        blocos={[
          bloco({
            estado: "pago",
            frase: "pago em 02/07",
            valor: { estado: "pago", total: 12345 },
            registrarHref: null,
          }),
        ]}
      />,
    )
    const card = screen.getByTestId("bloco-panorama")
    // Repouso atenuado…
    expect(card).toHaveClass("opacity-[0.62]")
    expect(card).toHaveClass("saturate-[0.55]")
    // …e contraste recuperado no hover.
    expect(card).toHaveClass("hover:opacity-100")
    expect(card).toHaveClass("hover:saturate-100")
  })

  it("test_bloco_vencida_reforca_borda_danger_no_hover", () => {
    render(<PanoramaContas blocos={[bloco({ estado: "vencida", frase: "venceu há 2 dias" })]} />)
    const card = screen.getByTestId("bloco-panorama")
    expect(card).toHaveClass("hover:border-luc-danger/60")
  })

  it("test_transicao_de_estados_respeita_reduced_motion", () => {
    render(<PanoramaContas blocos={[bloco()]} />)
    const card = screen.getByTestId("bloco-panorama")
    expect(card.className).toContain("transition-")
    expect(card).toHaveClass("motion-reduce:transition-none")
  })
})
