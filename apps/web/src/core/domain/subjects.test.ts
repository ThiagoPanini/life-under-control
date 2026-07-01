import { describe, expect, it } from "vitest"
import { AREAS } from "./areas"
import { assuntosDaArea, derivarEstadoArea, SUBJECTS, type Subject } from "./subjects"

describe("catálogo de Assuntos (ADR-0009)", () => {
  it("test_financas_declara_pagamentos_recorrentes_ativa", () => {
    const pagamentos = assuntosDaArea("financas").find((s) => s.slug === "pagamentos-recorrentes")

    expect(pagamentos).toBeDefined()
    expect(pagamentos?.estado).toBe("ativa")
    expect(pagamentos?.areaSlug).toBe("financas")
  })

  it("test_area_sem_assuntos_declarados_retorna_vazio", () => {
    expect(assuntosDaArea("saude")).toEqual([])
  })
})

describe("derivarEstadoArea (ADR-0009)", () => {
  it("test_area_ativa_sse_tem_assunto_ativa", () => {
    expect(derivarEstadoArea("financas", SUBJECTS)).toBe("ativa")
  })

  it("test_area_sem_assunto_ativa_fica_em_breve", () => {
    expect(derivarEstadoArea("saude", SUBJECTS)).toBe("em-breve")
  })

  it("test_area_so_com_assunto_em_breve_fica_em_breve", () => {
    const assuntos: Subject[] = [
      {
        slug: "investimentos",
        nome: "Investimentos",
        icon: "wallet",
        estado: "em-breve",
        areaSlug: "financas",
      },
    ]

    expect(derivarEstadoArea("financas", assuntos)).toBe("em-breve")
  })
})

describe("estado da Área é derivado dos Assuntos (ADR-0009)", () => {
  it("test_financas_deriva_ativa_no_catalogo", () => {
    expect(AREAS.find((a) => a.slug === "financas")?.estado).toBe("ativa")
  })

  it("test_demais_areas_derivam_em_breve", () => {
    for (const slug of ["gastronomia", "supermercado", "saude", "imovel", "carro"]) {
      expect(AREAS.find((a) => a.slug === slug)?.estado).toBe("em-breve")
    }
  })
})
