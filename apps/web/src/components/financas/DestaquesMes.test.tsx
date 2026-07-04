// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { DestaquesMes as Destaques } from "@/core/use-cases/derive-destaques-mes"
import { DestaquesMes } from "./DestaquesMes"

afterEach(cleanup)

const INSUF = { estado: "insuficiente" } as const

/** Destaques base — mês fechado mai/26 vs abr/26; cada teste sobrescreve as métricas. */
function destaques(over: Partial<Destaques> = {}): Destaques {
  return {
    competenciaCorrente: "2026-06",
    competenciaBase: "2026-04",
    competenciaFechada: "2026-05",
    maiorAlta: INSUF,
    maiorQueda: INSUF,
    maiorLancamento: INSUF,
    ...over,
  }
}

describe("DestaquesMes (Seam 2)", () => {
  it("test_rotula_periodo_e_mes_corrente_em_curso", () => {
    render(
      <DestaquesMes
        destaques={destaques({
          maiorLancamento: {
            estado: "ok",
            billId: "b",
            nome: "Energia",
            valor: 5000,
            competencia: "2026-05",
            paymentId: "p",
          },
        })}
      />,
    )
    expect(screen.getByText("Variações · mai/26 vs abr/26")).toBeInTheDocument()
    expect(screen.getByText(/jun\/26 em curso/)).toBeInTheDocument()
  })

  it("test_maior_alta_mostra_sinal_valores_e_descricao_acessivel", () => {
    render(
      <DestaquesMes
        destaques={destaques({
          maiorAlta: {
            estado: "ok",
            billId: "b-1",
            nome: "Internet",
            base: 1000,
            atual: 3000,
            delta: 2000,
            percentual: 200,
          },
        })}
      />,
    )
    // Sinal explícito (forma, não só cor).
    expect(screen.getByText("+200,0%")).toBeInTheDocument()
    expect(screen.getByText("Maior alta")).toBeInTheDocument()
    // "de → para" e descrição acessível não dependente de cor.
    expect(screen.getByText(/R\$ 10,00 → R\$ 30,00/)).toBeInTheDocument()
    expect(
      screen.getByText("Maior alta: Internet, de R$ 10,00 para R$ 30,00, +200,0%"),
    ).toBeInTheDocument()
  })

  it("test_maior_queda_mostra_percentual_negativo_com_menos_unicode", () => {
    render(
      <DestaquesMes
        destaques={destaques({
          maiorQueda: {
            estado: "ok",
            billId: "b-1",
            nome: "Mercado",
            base: 8000,
            atual: 3000,
            delta: -5000,
            percentual: -62.5,
          },
        })}
      />,
    )
    expect(screen.getByText("−62,5%")).toBeInTheDocument()
    expect(screen.getByText("Maior queda")).toBeInTheDocument()
  })

  it("test_maior_lancamento_mostra_conta_e_valor", () => {
    render(
      <DestaquesMes
        destaques={destaques({
          maiorLancamento: {
            estado: "ok",
            billId: "b-1",
            nome: "IPTU",
            valor: 45000,
            competencia: "2026-05",
            paymentId: "p-1",
          },
        })}
      />,
    )
    expect(screen.getByText("Maior Lançamento")).toBeInTheDocument()
    expect(screen.getByText("R$ 450,00")).toBeInTheDocument()
    expect(screen.getByText("Maior Lançamento: IPTU, R$ 450,00")).toBeInTheDocument()
  })

  it("test_metrica_sem_candidato_mostra_historico_insuficiente_nao_zero", () => {
    // Alta insuficiente convive com queda ok — cada métrica reporta a própria falta.
    render(
      <DestaquesMes
        destaques={destaques({
          maiorAlta: INSUF,
          maiorQueda: {
            estado: "ok",
            billId: "b-1",
            nome: "Mercado",
            base: 8000,
            atual: 3000,
            delta: -5000,
            percentual: -62.5,
          },
          maiorLancamento: {
            estado: "ok",
            billId: "b-1",
            nome: "Mercado",
            valor: 3000,
            competencia: "2026-05",
            paymentId: "p-1",
          },
        })}
      />,
    )
    // Só a alta ficou sem candidato → exatamente uma linha "Histórico insuficiente".
    expect(screen.getByText("Histórico insuficiente")).toBeInTheDocument()
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument()
    expect(screen.getByText("−62,5%")).toBeInTheDocument()
  })

  it("test_tudo_insuficiente_mostra_mensagem_unica_de_sem_lancamentos", () => {
    render(<DestaquesMes destaques={destaques()} />)
    expect(
      screen.getByText(
        "Sem Lançamentos suficientes nos dois últimos meses fechados para comparar.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText("Maior alta")).not.toBeInTheDocument()
  })
})
