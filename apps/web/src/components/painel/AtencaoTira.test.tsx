// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { TiraAtencao } from "@/core/use-cases/derive-atencao"
import { AtencaoTira } from "./AtencaoTira"

afterEach(cleanup)

const hrefConta = (contaId: string) => `/areas/financas/pagamentos-recorrentes/${contaId}`
const hrefBaixa = (contaId: string, competencia: string) =>
  `/areas/financas/pagamentos-recorrentes/${contaId}?competencia=${competencia}`

describe("AtencaoTira (Seam 3)", () => {
  it("test_calma_mostra_estado_tudo_em_dia_sem_lista", () => {
    render(<AtencaoTira tira={{ estado: "calma" }} hrefConta={hrefConta} hrefBaixa={hrefBaixa} />)
    expect(screen.getByText(/tudo em dia/i)).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })

  it("test_pendente_mostra_contagem_soma_e_ctas_honestas", () => {
    const tira: TiraAtencao = {
      estado: "pendente",
      itens: [
        {
          contaId: "luz",
          titulo: "Luz",
          competencia: "2026-07",
          farol: "vermelho",
          frase: "vence hoje",
          detalhe: "competência de julho, sem Lançamento",
          origem: "Finanças · Pagamentos Recorrentes",
          valorEstimado: 11000,
        },
      ],
      totalEstimado: 11000,
    }
    render(<AtencaoTira tira={tira} hrefConta={hrefConta} hrefBaixa={hrefBaixa} />)

    expect(screen.getByText("Pede atenção · 1")).toBeInTheDocument()
    expect(screen.getByText(/R\$ 110,00 pedem atenção agora/)).toBeInTheDocument()
    expect(screen.getByText(/Luz — vence hoje/)).toBeInTheDocument()
    expect(screen.getByText("competência de julho, sem Lançamento")).toBeInTheDocument()
    expect(screen.getByText("Finanças · Pagamentos Recorrentes")).toBeInTheDocument()
    expect(screen.getByText("estimativa")).toBeInTheDocument()

    const darBaixa = screen.getByRole("link", { name: /Dar baixa/ })
    expect(darBaixa).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/luz?competencia=2026-07",
    )
    const verConta = screen.getByRole("link", { name: /Ver Conta/ })
    expect(verConta).toHaveAttribute("href", "/areas/financas/pagamentos-recorrentes/luz")
  })

  it("test_sem_historico_omite_valor_mas_mantem_item", () => {
    const tira: TiraAtencao = {
      estado: "pendente",
      itens: [
        {
          contaId: "nova",
          titulo: "Internet",
          competencia: "2026-07",
          farol: "vermelho",
          frase: "vence hoje",
          detalhe: "competência de julho, sem Lançamento",
          origem: "Finanças · Pagamentos Recorrentes",
          valorEstimado: null,
        },
      ],
      totalEstimado: null,
    }
    render(<AtencaoTira tira={tira} hrefConta={hrefConta} hrefBaixa={hrefBaixa} />)
    expect(screen.queryByText("estimativa")).not.toBeInTheDocument()
  })
})
