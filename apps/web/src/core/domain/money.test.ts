import { describe, expect, it } from "vitest"
import { formatBRL } from "./money"

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
