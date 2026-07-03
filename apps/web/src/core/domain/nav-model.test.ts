import { describe, expect, it } from "vitest"
import { assuntoUnicoAtivo, buildNavModel, naArea } from "./nav-model"
import type { Subject } from "./subjects"

describe("buildNavModel (ADR-0009, issue #46)", () => {
  it("test_area_com_assuntos_expande", () => {
    const [financas] = buildNavModel("/painel").filter((area) => area.slug === "financas")

    expect(financas.expandivel).toBe(true)
    expect(financas.inerte).toBe(false)
    expect(financas.assuntos).toHaveLength(1)
  })

  it("test_area_em_breve_sem_assuntos_inerte", () => {
    const [saude] = buildNavModel("/painel").filter((area) => area.slug === "saude")

    expect(saude.expandivel).toBe(false)
    expect(saude.inerte).toBe(true)
    expect(saude.assuntos).toEqual([])
  })

  it("test_assunto_em_breve_nao_aparece_na_lista_de_assuntos", () => {
    const financas = buildNavModel("/painel").find((area) => area.slug === "financas")
    const investimentos = financas?.assuntos.find((assunto) => assunto.slug === "investimentos")

    expect(investimentos).toBeUndefined()
    expect(financas?.assuntos.map((assunto) => assunto.slug)).toEqual(["pagamentos-recorrentes"])
  })

  it("test_trilha_ativa_marca_area_da_rota", () => {
    const navModel = buildNavModel("/areas/financas/pagamentos-recorrentes")
    const financas = navModel.find((area) => area.slug === "financas")
    const pagamentos = financas?.assuntos.find(
      (assunto) => assunto.slug === "pagamentos-recorrentes",
    )
    const outraArea = navModel.find((area) => area.slug === "saude")

    expect(financas?.ativa).toBe(true)
    expect(pagamentos?.ativa).toBe(true)
    expect(outraArea?.ativa).toBe(false)
  })

  it("test_trilha_ativa_marca_assunto_em_sub_rota_aninhada", () => {
    const navModel = buildNavModel("/areas/financas/pagamentos-recorrentes/nova")
    const financas = navModel.find((area) => area.slug === "financas")
    const pagamentos = financas?.assuntos.find(
      (assunto) => assunto.slug === "pagamentos-recorrentes",
    )

    expect(pagamentos?.ativa).toBe(true)
  })
})

describe("naArea — dedup do helper de trilha ativa (issue #46, code review)", () => {
  it("test_naarea_reconhece_raiz_e_sub_rota_mas_nao_outra_area", () => {
    expect(naArea("/areas/financas", "financas")).toBe(true)
    expect(naArea("/areas/financas/pagamentos-recorrentes", "financas")).toBe(true)
    expect(naArea("/areas/saude", "financas")).toBe(false)
  })
})

describe("assuntoUnicoAtivo — redirect condicional da raiz (ADR-0009, emenda D1)", () => {
  it("test_raiz_redireciona_com_um_assunto_ativo", () => {
    const unico = assuntoUnicoAtivo("financas")

    expect(unico?.slug).toBe("pagamentos-recorrentes")
  })

  it("test_raiz_vira_mini_painel_com_dois_assuntos_ativos", () => {
    const doisAtivos: Subject[] = [
      {
        slug: "pagamentos-recorrentes",
        nome: "Pagamentos Recorrentes",
        icon: "wallet",
        estado: "ativa",
        areaSlug: "financas",
      },
      {
        slug: "investimentos",
        nome: "Investimentos",
        icon: "trending-up",
        estado: "ativa",
        areaSlug: "financas",
      },
    ]

    expect(assuntoUnicoAtivo("financas", doisAtivos)).toBeNull()
  })
})
