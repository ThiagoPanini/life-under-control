// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { GridCelula } from "@/core/use-cases/derive-bill-card"
import type { LinhaAnalitica } from "@/core/use-cases/derive-visao-analitica"
import { type ItemAnalitico, VisaoAnaliticaContas } from "./VisaoAnaliticaContas"

afterEach(cleanup)

const COMPS = [
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
]

/** 12 células em dia, R$ 100 cada — sinaleiro cheio de base. */
function gridCheio(): GridCelula[] {
  return COMPS.map((c) => ({
    competencia: c,
    vencimento: `${c}-10`,
    estado: "em-dia",
    valor: 10000,
  }))
}

function linhaAnalitica(over: Partial<LinhaAnalitica> = {}): LinhaAnalitica {
  return {
    billId: "luz",
    encerrada: false,
    estado: "vence-em-breve",
    competenciaVigente: "2026-07",
    vencimento: "2026-07-10",
    valor: { estado: "estimativa", media: 5000 },
    frase: "vence em 2 dias",
    autoria: null,
    grid: gridCheio(),
    sparkline: COMPS.map(() => 10000),
    media: 10000,
    desvioValor: null,
    pontualidade: {
      estado: "calculada",
      percentual: 92,
      noPrazo: 11,
      total: 12,
      frase: "11/12 no prazo",
    },
    ...over,
  }
}

function item(
  over: Partial<ItemAnalitico> = {},
  linha: Partial<LinhaAnalitica> = {},
): ItemAnalitico {
  return {
    linha: linhaAnalitica(linha),
    nome: "Luz",
    icon: "zap",
    logoUrl: null,
    vencimentoDesc: "todo dia 10",
    datasPagamento: {},
    ...over,
  }
}

describe("VisaoAnaliticaContas (Seam 2)", () => {
  it("test_secao_some_sem_conta", () => {
    const { container } = render(<VisaoAnaliticaContas itens={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("test_identificacao_com_link_e_vencimento", () => {
    render(<VisaoAnaliticaContas itens={[item()]} />)
    expect(screen.getByRole("link", { name: "Luz" })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/luz",
    )
    expect(screen.getByText("todo dia 10")).toBeInTheDocument()
  })

  it("test_sinaleiro_doze_celulas_com_rotulo_acessivel", () => {
    render(<VisaoAnaliticaContas itens={[item()]} />)
    const celulas = screen.getAllByTestId("sinaleiro-cell")
    expect(celulas).toHaveLength(12)
    // cada célula carrega estado por texto (nunca só cor) — a última é em dia.
    expect(celulas.every((c) => (c.getAttribute("aria-label") ?? "").includes("em dia"))).toBe(true)
  })

  it("test_sinaleiro_inclui_data_do_pagamento_no_rotulo", () => {
    render(<VisaoAnaliticaContas itens={[item({ datasPagamento: { "2026-07": "2026-07-08" } })]} />)
    const ultima = screen.getAllByTestId("sinaleiro-cell").at(-1)
    expect(ultima?.getAttribute("aria-label")).toContain("pago em 08/07")
  })

  it("test_pontualidade_percentual_visivel", () => {
    render(<VisaoAnaliticaContas itens={[item()]} />)
    expect(screen.getByText("92%")).toBeInTheDocument()
  })

  it("test_valor_pago_mostra_soma_das_baixas", () => {
    render(
      <VisaoAnaliticaContas
        itens={[item({}, { estado: "pago", valor: { estado: "pago", total: 12345 } })]}
      />,
    )
    expect(screen.getByText("R$ 123,45")).toBeInTheDocument()
  })

  it.each([
    ["acima", 2500, "+R$ 25,00 da média"],
    ["na-media", 0, "+R$ 0,00 da média"],
    ["abaixo", -1200, "−R$ 12,00 da média"],
  ] as const)("test_valor_pago_mostra_delta_%s_abaixo_do_total", (estado, centavos, texto) => {
    render(
      <VisaoAnaliticaContas
        itens={[
          item(
            {},
            {
              estado: "pago",
              valor: { estado: "pago", total: 12345 },
              desvioValor: { estado, centavos },
            },
          ),
        ]}
      />,
    )
    const desvio = screen.getByTestId("desvio-valor")
    expect(desvio).toHaveAttribute("data-estado", estado)
    expect(desvio).toHaveTextContent(texto)
  })

  it("test_valor_em_aberto_estimativa_prefixada_e_rotulada", () => {
    render(<VisaoAnaliticaContas itens={[item()]} />)
    expect(screen.getByText("≈ R$ 50")).toBeInTheDocument()
    expect(screen.getByText("estimado")).toBeInTheDocument()
  })

  it("test_status_pill_da_ocorrencia_vigente", () => {
    render(<VisaoAnaliticaContas itens={[item({}, { estado: "vencida" })]} />)
    const pill = screen.getByLabelText("Conta vencida")
    expect(pill).toHaveAttribute("data-tone", "danger")
    expect(screen.getByText("vencida")).toBeInTheDocument()
  })

  it("test_registrar_presente_em_aberto_e_ausente_quando_pago", () => {
    const { rerender } = render(<VisaoAnaliticaContas itens={[item()]} />)
    expect(screen.getByRole("link", { name: "Registrar" })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes?registrar=luz",
    )
    rerender(
      <VisaoAnaliticaContas
        itens={[item({}, { estado: "pago", valor: { estado: "pago", total: 1000 } })]}
      />,
    )
    expect(screen.queryByRole("link", { name: "Registrar" })).not.toBeInTheDocument()
  })

  it("test_encerradas_fora_por_padrao_e_reveladas_pelo_switch", () => {
    const ativa = item({ nome: "Luz" }, { billId: "luz" })
    const encerrada = item(
      { nome: "TV a Cabo" },
      { billId: "tv", encerrada: true, valor: { estado: "ausente" } },
    )
    render(<VisaoAnaliticaContas itens={[ativa, encerrada]} />)

    // default: só a ativa; o switch começa desligado.
    expect(screen.getAllByTestId("linha-analitica")).toHaveLength(1)
    const sw = screen.getByRole("switch", { name: /incluir encerradas/i })
    expect(sw).toHaveAttribute("aria-checked", "false")

    fireEvent.click(sw)

    const linhas = screen.getAllByTestId("linha-analitica")
    expect(linhas).toHaveLength(2)
    const linhaEncerrada = linhas.find((l) => l.getAttribute("data-encerrada") === "true")
    expect(linhaEncerrada).toBeTruthy()
    expect(linhaEncerrada).toHaveTextContent("encerrada")
    // sem botão de registrar na encerrada e valor em traço.
    expect(screen.getAllByRole("link", { name: "Registrar" })).toHaveLength(1) // só a ativa
  })

  it("test_switch_ausente_quando_nao_ha_encerradas", () => {
    render(<VisaoAnaliticaContas itens={[item()]} />)
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
  })

  it("test_cabecalho_e_switch_ficam_fora_do_bloco_da_tabela", () => {
    const encerrada = item(
      { nome: "TV a Cabo" },
      { billId: "tv", encerrada: true, valor: { estado: "ausente" } },
    )
    render(<VisaoAnaliticaContas itens={[item(), encerrada]} />)

    const blocoTabela = screen.getByRole("table").closest(".rounded-luc-lg")
    expect(blocoTabela).not.toContainElement(screen.getByText("Detalhes das Contas"))
    expect(blocoTabela).not.toContainElement(
      screen.getByText("Visão detalhada de cada conta registrada."),
    )
    expect(blocoTabela).not.toContainElement(screen.getByRole("switch"))
  })

  it("test_sparkline_oculta_dots_e_revela_apenas_o_ponto_em_hover", () => {
    render(<VisaoAnaliticaContas itens={[item()]} />)
    expect(screen.queryByTestId("sparkline-dot")).not.toBeInTheDocument()

    const primeiroPonto = screen.getAllByTestId("sparkline-hit-area")[0]
    fireEvent.mouseEnter(primeiroPonto)
    expect(screen.getAllByTestId("sparkline-dot")).toHaveLength(1)

    fireEvent.mouseLeave(primeiroPonto)
    expect(screen.queryByTestId("sparkline-dot")).not.toBeInTheDocument()
  })
})
