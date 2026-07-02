// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MarcadorPista } from "@/core/use-cases/derive-forma-competencia"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import {
  agruparPorDia,
  estadoPrioritarioDoGrupo,
  PistaDoMes,
  posicaoPercentual,
  ultimoDiaDoMes,
} from "./PistaDoMes"

afterEach(cleanup)

function marcador(over: Partial<MarcadorPista> = {}): MarcadorPista {
  return {
    dia: "2026-07-10",
    competencia: "2026-07",
    contaId: "luz",
    titulo: "Luz",
    estado: "aguardando",
    valorEsperado: null,
    ...over,
  }
}

describe("ultimoDiaDoMes / posicaoPercentual (funções puras)", () => {
  it("test_ultimo_dia_de_julho_e_31", () => {
    expect(ultimoDiaDoMes("2026-07")).toBe(31)
  })

  it("test_ultimo_dia_de_fevereiro_bissexto_e_29", () => {
    expect(ultimoDiaDoMes("2028-02")).toBe(29)
  })

  it("test_dia_1_fica_em_0_por_cento_dia_ultimo_em_100", () => {
    expect(posicaoPercentual("2026-07-01", 31)).toBe(0)
    expect(posicaoPercentual("2026-07-31", 31)).toBe(100)
  })
})

describe("agruparPorDia / estadoPrioritarioDoGrupo (funções puras)", () => {
  it("test_agrupa_marcadores_do_mesmo_dia", () => {
    const grupos = agruparPorDia([
      marcador({ contaId: "luz", dia: "2026-07-10" }),
      marcador({ contaId: "agua", dia: "2026-07-10" }),
      marcador({ contaId: "netflix", dia: "2026-07-14" }),
    ])
    expect(grupos).toHaveLength(2)
    expect(grupos.find((g) => g.dia === "2026-07-10")?.itens).toHaveLength(2)
  })

  it("test_prioridade_a_vencer_sobre_aguardando_e_quitada", () => {
    const grupo = [
      marcador({ estado: "quitada" }),
      marcador({ estado: "a-vencer" }),
      marcador({ estado: "aguardando" }),
    ]
    expect(estadoPrioritarioDoGrupo(grupo)).toBe("a-vencer")
  })

  it("test_so_quitada_quando_todos_quitados", () => {
    const grupo = [marcador({ estado: "quitada" }), marcador({ estado: "quitada" })]
    expect(estadoPrioritarioDoGrupo(grupo)).toBe("quitada")
  })
})

describe("PistaDoMes (Seam 2, interativa)", () => {
  it("test_ticks_do_mes_incluem_extremos", () => {
    render(<PistaDoMes competencia="2026-07" hoje="2026-07-01" marcadores={[]} />)
    for (const tick of ["1", "5", "10", "15", "20", "25", "31"]) {
      expect(screen.getByText(tick)).toBeInTheDocument()
    }
  })

  it("test_marcador_hoje_so_aparece_quando_competencia_e_o_mes_corrente", () => {
    const { rerender } = render(
      <PistaDoMes competencia="2026-07" hoje="2026-07-15" marcadores={[]} />,
    )
    expect(screen.getByText("hoje")).toBeInTheDocument()

    rerender(<PistaDoMes competencia="2026-08" hoje="2026-07-15" marcadores={[]} />)
    expect(screen.queryByText("hoje")).not.toBeInTheDocument()
  })

  it("test_marcador_unico_e_link_focavel_com_estado_em_texto", () => {
    render(
      <PistaDoMes
        competencia="2026-07"
        hoje="2026-07-01"
        marcadores={[
          marcador({
            contaId: "luz",
            titulo: "Luz",
            dia: "2026-07-10",
            estado: "a-vencer",
            valorEsperado: 9000,
          }),
        ]}
      />,
    )
    const link = screen.getByRole("link", { name: /Luz.*dia 10.*vence em até 3 dias.*~R\$ 90,00/ })
    expect(link).toHaveAttribute("href", "/areas/financas/pagamentos-recorrentes/luz")
    expect(link.className).toContain("h-6")
    expect(link.className).toContain("w-6")
  })

  it("test_marcador_quitada_mostra_valor_exato_sem_til", () => {
    render(
      <PistaDoMes
        competencia="2026-07"
        hoje="2026-07-01"
        marcadores={[
          marcador({
            contaId: "luz",
            titulo: "Luz",
            dia: "2026-07-05",
            estado: "quitada",
            valorEsperado: 8000,
          }),
        ]}
      />,
    )
    expect(
      screen.getByRole("link", { name: /Luz.*dia 05.*quitada.*R\$ 80,00/ }),
    ).toBeInTheDocument()
  })

  it("test_colisao_no_mesmo_dia_agrupa_com_contagem_e_lista_todos_no_tooltip", () => {
    render(
      <PistaDoMes
        competencia="2026-07"
        hoje="2026-07-01"
        marcadores={[
          marcador({ contaId: "luz", titulo: "Luz", dia: "2026-07-10" }),
          marcador({ contaId: "agua", titulo: "Água", dia: "2026-07-10" }),
        ]}
      />,
    )
    const grupo = screen.getByRole("button", { name: /2 vencimentos.*dia 10/ })
    expect(grupo.className).toContain("h-6")
    expect(screen.getByRole("link", { name: /Luz/ })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/luz",
    )
    expect(screen.getByRole("link", { name: /Água/ })).toHaveAttribute(
      "href",
      "/areas/financas/pagamentos-recorrentes/agua",
    )
  })
})

describe("PistaDoMes (Seam 2, read-only para reuso — #47)", () => {
  it("test_modo_nao_interativo_usa_title_sem_link_nem_foco", () => {
    render(
      <PistaDoMes
        competencia="2026-07"
        hoje="2026-07-01"
        interativa={false}
        marcadores={[marcador({ contaId: "luz", titulo: "Luz", dia: "2026-07-10" })]}
      />,
    )
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    const marcadorEl = screen.getByTitle(/Luz.*dia 10/)
    expect(marcadorEl).toBeInTheDocument()
  })
})
