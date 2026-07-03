// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { type BlocoPanorama, PanoramaContas } from "./PanoramaContas"

afterEach(cleanup)

/** Bloco em aberto (amarelo, estimativa) — base que cada teste muta. */
function bloco(over: Partial<BlocoPanorama> = {}): BlocoPanorama {
  return {
    billId: "luz",
    nome: "Luz",
    icon: "zap",
    logoUrl: null,
    farol: "amarelo",
    frase: "vence em 2 dias",
    valor: { estado: "estimativa", media: 5000 },
    registrarHref: "/areas/financas/pagamentos-recorrentes/luz?registrar=1&competencia=2026-07",
    ...over,
  }
}

describe("PanoramaContas (Seam 2)", () => {
  it("test_contagem_quitadas_e_bloco_quitado_sem_botao", () => {
    render(
      <PanoramaContas
        blocos={[
          bloco({
            billId: "agua",
            nome: "Água",
            farol: "verde",
            frase: "pago em 02/07",
            valor: { estado: "real", valor: 12345 },
            registrarHref: null,
          }),
          bloco(),
        ]}
      />,
    )
    expect(screen.getByText("1 de 2 Contas quitadas")).toBeInTheDocument()
    expect(screen.getByText("R$ 123,45")).toBeInTheDocument()
    expect(screen.getByText("pago em 02/07")).toBeInTheDocument()
    // quitada não tem o que registrar: um único CTA, o do bloco em aberto
    expect(screen.getAllByRole("link", { name: "Registrar pagamento" })).toHaveLength(1)
  })

  it("test_bloco_em_aberto_estimativa_com_cta_de_baixa", () => {
    render(<PanoramaContas blocos={[bloco()]} />)
    expect(screen.getByText("~R$ 50,00")).toBeInTheDocument()
    expect(screen.getByText("· valor estimado")).toBeInTheDocument()
    expect(screen.getByText("vence em até 3 dias")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Registrar pagamento" })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/luz?registrar=1&competencia=2026-07",
    )
  })

  it("test_estimativa_sem_historico_nao_inventa_valor", () => {
    render(<PanoramaContas blocos={[bloco({ valor: { estado: "estimativa", media: null } })]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()
  })

  it("test_sem_ocorrencias_no_mes_mensagem_honesta", () => {
    render(<PanoramaContas blocos={[]} />)
    expect(screen.getByText("Nenhuma Conta com ocorrência neste mês.")).toBeInTheDocument()
  })
})
