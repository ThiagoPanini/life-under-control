// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { Area } from "@/core/domain/areas"
import type { HeroAreaAtiva } from "@/core/use-cases/derive-atencao"
import { HeroAreaAtivaCard } from "./HeroAreaAtivaCard"

afterEach(cleanup)

const area: Area = {
  slug: "financas",
  nome: "Finanças",
  icon: "wallet",
  estado: "ativa",
  resumo: "Contas e Lançamentos do mês",
}

function heroBase(over: Partial<HeroAreaAtiva> = {}): HeroAreaAtiva {
  return {
    competencia: "2026-07",
    quitadas: { quitadas: 2, total: 5 },
    proxima: { titulo: "Água", frase: "em 10 dias" },
    pista: [
      {
        dia: "2026-07-02",
        competencia: "2026-07",
        contaId: "luz",
        titulo: "Luz",
        estado: "quitada",
        valorEsperado: 10000,
      },
      {
        dia: "2026-07-20",
        competencia: "2026-07",
        contaId: "agua",
        titulo: "Água",
        estado: "aguardando",
        valorEsperado: null,
      },
    ],
    ...over,
  }
}

describe("HeroAreaAtivaCard (Seam 3)", () => {
  it("test_manchete_quitadas_proxima_e_mini_pista_read_only", () => {
    render(
      <HeroAreaAtivaCard
        area={area}
        assuntoNome="Pagamentos Recorrentes"
        contasAtivas={5}
        emBreveResumo="Investimentos em breve"
        hero={heroBase()}
        href="/areas/financas"
      />,
    )

    expect(screen.getByText("Finanças")).toBeInTheDocument()
    expect(screen.getByText("ativa")).toBeInTheDocument()
    expect(
      screen.getByText("Pagamentos Recorrentes · 5 Contas ativas · Investimentos em breve"),
    ).toBeInTheDocument()
    expect(screen.getByText("2/5 quitadas em Julho")).toBeInTheDocument()
    expect(screen.getByText(/próxima: Água em 10 dias/)).toBeInTheDocument()

    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "/areas/financas")

    const marcadores = screen.getAllByTitle(/Luz|Água/)
    expect(marcadores).toHaveLength(2)
    expect(marcadores[0]).not.toHaveAttribute("onclick")
  })

  it("test_sem_proxima_mostra_copy_honesta_de_tudo_pago", () => {
    render(
      <HeroAreaAtivaCard
        area={area}
        assuntoNome="Pagamentos Recorrentes"
        contasAtivas={2}
        emBreveResumo="Investimentos em breve"
        hero={heroBase({ proxima: null, quitadas: { quitadas: 2, total: 2 } })}
        href="/areas/financas"
      />,
    )
    expect(screen.getByText(/tudo pago/i)).toBeInTheDocument()
  })
})
