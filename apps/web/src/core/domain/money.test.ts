import { describe, expect, it } from "vitest"
import { centavosParaCampo, formatBRL, parseCentavos } from "./money"

describe("formatBRL", () => {
  it("test_zero_centavos_retorna_real_zerado", () => {
    // given um valor zerado em centavos
    // when formatado
    // then mostra R$ 0,00
    expect(formatBRL(0)).toBe("R$ 0,00")
  })

  it("test_valor_com_centavos_usa_virgula_decimal", () => {
    expect(formatBRL(980_00)).toBe("R$ 980,00")
    expect(formatBRL(5)).toBe("R$ 0,05")
    expect(formatBRL(199)).toBe("R$ 1,99")
  })

  it("test_milhar_usa_ponto_separador", () => {
    expect(formatBRL(3_751_20)).toBe("R$ 3.751,20")
    expect(formatBRL(1_000_000_00)).toBe("R$ 1.000.000,00")
  })

  it("test_valor_negativo_prefixa_sinal", () => {
    expect(formatBRL(-980_00)).toBe("-R$ 980,00")
  })

  it("test_centavos_nao_inteiro_lanca_erro", () => {
    expect(() => formatBRL(10.5)).toThrow(/inteiro em centavos/)
  })
})

describe("parseCentavos", () => {
  it("test_aceita_formato_br_com_milhar_e_virgula", () => {
    expect(parseCentavos("1.234,56")).toBe(123456)
    expect(parseCentavos("R$ 1.234,56")).toBe(123456)
  })

  it("test_aceita_virgula_sem_milhar", () => {
    expect(parseCentavos("19,99")).toBe(1999)
    expect(parseCentavos("1234,5")).toBe(123450)
  })

  it("test_aceita_ponto_decimal_do_teclado_numerico", () => {
    // ponto com 1–2 casas é decimal (teclado numérico / colagem)
    expect(parseCentavos("1234.56")).toBe(123456)
    expect(parseCentavos("129.90")).toBe(12990)
  })

  it("test_aceita_ponto_de_milhar_sem_virgula", () => {
    // ponto com grupo final de 3 dígitos é milhar — não 0,3 reais (#1 da review)
    expect(parseCentavos("1.500")).toBe(150000)
    expect(parseCentavos("1.234.567")).toBe(123456700)
  })

  it("test_inteiro_sem_decimal_vira_reais", () => {
    expect(parseCentavos("1234")).toBe(123400)
    expect(parseCentavos("100")).toBe(10000)
  })

  it("test_recusa_vazio_e_lixo", () => {
    expect(parseCentavos("")).toBeNull()
    expect(parseCentavos("  ")).toBeNull()
    expect(parseCentavos("abc")).toBeNull()
    expect(parseCentavos("1,234")).toBeNull() // 3 casas decimais não é dinheiro
    expect(parseCentavos("-10,00")).toBeNull() // negativo não é uma baixa
  })
})

describe("centavosParaCampo", () => {
  it("test_projeta_centavos_em_texto_de_input", () => {
    expect(centavosParaCampo(123456)).toBe("1234,56")
    expect(centavosParaCampo(1999)).toBe("19,99")
    expect(centavosParaCampo(5)).toBe("0,05")
    expect(centavosParaCampo(10000)).toBe("100,00")
  })

  it("test_round_trip_com_parseCentavos", () => {
    expect(parseCentavos(centavosParaCampo(123456))).toBe(123456)
  })
})
