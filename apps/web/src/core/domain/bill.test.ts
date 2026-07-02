import { describe, expect, it } from "vitest"
import {
  type BillBruto,
  descreverRecorrencia,
  descreverVencimento,
  ehDataIsoValida,
  formatarDataBr,
  mesCurto,
  validarDadosBill,
} from "./bill"

/** Seam 1: a regra pura de cadastro de Conta — sem banco, sem framework. */

/** Cadastro válido mínimo (mensal, dia-fixo) — cada teste muta o que importa. */
function brutoValido(over: Partial<BillBruto> = {}): BillBruto {
  return {
    nome: "Condomínio",
    descricao: null,
    icon: "home",
    intervalMonths: 1,
    anchorMonth: null,
    dueRuleKind: "dia-fixo",
    dueRuleDay: 10,
    dueRuleNth: null,
    dueMonthOffset: 0,
    ...over,
  }
}

describe("validarDadosBill (Seam 1)", () => {
  it("test_cadastro_mensal_dia_fixo_normaliza_e_passa", () => {
    // given um cadastro mensal com dia fixo e espaços no nome
    // when validado
    const res = validarDadosBill(brutoValido({ nome: "  Condomínio  ", descricao: "  " }))
    // then passa, com nome aparado, descrição vazia virando null e âncora null
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value).toEqual({
      nome: "Condomínio",
      descricao: null,
      icon: "home",
      recurrence: { intervalMonths: 1, anchorMonth: null },
      dueRule: { kind: "dia-fixo", day: 10 },
      dueMonthOffset: 0,
    })
  })

  it("test_mensal_ignora_ancora_informada", () => {
    // given mensal mas com âncora preenchida (irrelevante)
    const res = validarDadosBill(brutoValido({ intervalMonths: 1, anchorMonth: 5 }))
    // then a âncora é descartada (null) — mensal não ancora
    expect(res.ok && res.value.recurrence.anchorMonth).toBe(null)
  })

  it("test_intervalo_maior_que_um_exige_ancora", () => {
    // given bimestral sem âncora
    const res = validarDadosBill(brutoValido({ intervalMonths: 2, anchorMonth: null }))
    // then erro no campo anchorMonth
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.erros.map((e) => e.campo)).toContain("anchorMonth")
  })

  it("test_anual_com_ancora_passa", () => {
    const res = validarDadosBill(brutoValido({ intervalMonths: 12, anchorMonth: 1 }))
    expect(res.ok && res.value.recurrence).toEqual({ intervalMonths: 12, anchorMonth: 1 })
  })

  it("test_nome_vazio_falha", () => {
    const res = validarDadosBill(brutoValido({ nome: "   " }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.erros.map((e) => e.campo)).toContain("nome")
  })

  it("test_icone_fora_do_catalogo_falha", () => {
    const res = validarDadosBill(brutoValido({ icon: "skull" }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.erros.map((e) => e.campo)).toContain("icon")
  })

  it("test_dia_fixo_fora_de_1_a_31_falha", () => {
    expect(validarDadosBill(brutoValido({ dueRuleDay: 0 })).ok).toBe(false)
    expect(validarDadosBill(brutoValido({ dueRuleDay: 32 })).ok).toBe(false)
    const res = validarDadosBill(brutoValido({ dueRuleDay: 40 }))
    if (res.ok) return
    expect(res.erros.map((e) => e.campo)).toContain("dueRuleDay")
  })

  it("test_dia_invalido_nao_gera_erro_espurio_de_forma", () => {
    // Forma válida (dia-fixo) com dia fora de faixa: só o erro do dia, nunca um
    // "Forma de vencimento inválida" contraditório no campo dueRuleKind.
    const res = validarDadosBill(brutoValido({ dueRuleDay: 40 }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    const campos = res.erros.map((e) => e.campo)
    expect(campos).toContain("dueRuleDay")
    expect(campos).not.toContain("dueRuleKind")
  })

  it("test_n_esimo_dia_util_monta_uniao_correta", () => {
    const res = validarDadosBill(
      brutoValido({ dueRuleKind: "n-esimo-dia-util", dueRuleDay: null, dueRuleNth: 5 }),
    )
    expect(res.ok && res.value.dueRule).toEqual({ kind: "n-esimo-dia-util", nth: 5 })
  })

  it("test_n_esimo_sem_nth_falha", () => {
    const res = validarDadosBill(
      brutoValido({ dueRuleKind: "n-esimo-dia-util", dueRuleDay: null, dueRuleNth: null }),
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.erros.map((e) => e.campo)).toContain("dueRuleNth")
  })

  it("test_ultimo_dia_util_dispensa_parametro", () => {
    const res = validarDadosBill(brutoValido({ dueRuleKind: "ultimo-dia-util", dueRuleDay: null }))
    expect(res.ok && res.value.dueRule).toEqual({ kind: "ultimo-dia-util" })
  })

  it("test_forma_de_vencimento_desconhecida_falha", () => {
    const res = validarDadosBill(brutoValido({ dueRuleKind: "quando-der" }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.erros.map((e) => e.campo)).toContain("dueRuleKind")
  })

  it("test_offset_ausente_vira_zero", () => {
    const res = validarDadosBill(brutoValido({ dueMonthOffset: null }))
    expect(res.ok && res.value.dueMonthOffset).toBe(0)
  })

  it("test_offset_de_condominio_mais_um_passa", () => {
    // o condomínio "de janeiro" vence em fevereiro (offset +1) — caso real do grilling
    const res = validarDadosBill(brutoValido({ dueMonthOffset: 1 }))
    expect(res.ok && res.value.dueMonthOffset).toBe(1)
  })

  it("test_offset_negativo_falha", () => {
    const res = validarDadosBill(brutoValido({ dueMonthOffset: -1 }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.erros.map((e) => e.campo)).toContain("dueMonthOffset")
  })

  it("test_nunca_aceita_valor_no_cadastro", () => {
    // A regra não tem campo de valor (invariante #5): o tipo DadosBill não o
    // expõe e a saída validada nunca o carrega.
    const res = validarDadosBill(brutoValido())
    expect(res.ok && "valor" in res.value).toBe(false)
  })
})

describe("descreverRecorrencia (Seam 1)", () => {
  it("test_mensal", () => {
    expect(descreverRecorrencia({ intervalMonths: 1, anchorMonth: null })).toBe("Mensal")
  })
  it("test_anual_com_ancora", () => {
    expect(descreverRecorrencia({ intervalMonths: 12, anchorMonth: 1 })).toBe("Anual · Janeiro")
  })
  it("test_intervalo_incomum_cai_no_generico", () => {
    expect(descreverRecorrencia({ intervalMonths: 4, anchorMonth: 3 })).toBe(
      "A cada 4 meses · Março",
    )
  })
})

describe("descreverVencimento (Seam 1)", () => {
  it("test_dia_fixo_sem_offset", () => {
    expect(descreverVencimento({ kind: "dia-fixo", day: 10 }, 0)).toBe("Vence dia 10")
  })
  it("test_n_esimo_dia_util", () => {
    expect(descreverVencimento({ kind: "n-esimo-dia-util", nth: 5 }, 0)).toBe("5º dia útil")
  })
  it("test_ultimo_dia_util_com_offset_um", () => {
    expect(descreverVencimento({ kind: "ultimo-dia-util" }, 1)).toBe(
      "Último dia útil (competência +1 mês)",
    )
  })
  it("test_offset_plural", () => {
    expect(descreverVencimento({ kind: "dia-fixo", day: 5 }, 2)).toBe(
      "Vence dia 5 (competência +2 meses)",
    )
  })
})

describe("ehDataIsoValida (Seam 1)", () => {
  it("test_data_civil_valida_passa", () => {
    expect(ehDataIsoValida("2026-06-29")).toBe(true)
  })
  it("test_formato_torto_falha", () => {
    expect(ehDataIsoValida("29/06/2026")).toBe(false)
    expect(ehDataIsoValida("2026-6-9")).toBe(false)
    expect(ehDataIsoValida("")).toBe(false)
  })
  it("test_dia_inexistente_falha", () => {
    // 30/02 não existe; o round-trip por Date.UTC pega o overflow.
    expect(ehDataIsoValida("2026-02-30")).toBe(false)
    expect(ehDataIsoValida("2026-13-01")).toBe(false)
  })
})

describe("formatarDataBr (Seam 1)", () => {
  it("test_iso_vira_pt_br", () => {
    expect(formatarDataBr("2026-06-29")).toBe("29/06/2026")
  })
})

describe("mesCurto (Seam 1)", () => {
  it("test_competencia_vira_abreviacao_pt_br", () => {
    expect(mesCurto("2026-01")).toBe("jan")
    expect(mesCurto("2026-06")).toBe("jun")
    expect(mesCurto("2026-12")).toBe("dez")
  })
})
