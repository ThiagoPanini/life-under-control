import { describe, expect, it } from "vitest"
import { parseReciboWhatsapp } from "./recibo-whatsapp"

/**
 * Validação de domínio do recibo extraído (ADR-0013): o núcleo valida o retorno
 * do adapter — centavos inteiros > 0, datas ISO — e **não confia** no LLM. Campo
 * ilegível chega `null` e é preservado; "ilegível" nunca vira palpite (invariante
 * #3 do CONTEXT.md — persistir fatos, jamais derivar).
 */
function bruto(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    valorCentavos: null,
    dataPagamento: null,
    favorecido: null,
    vencimentoImpresso: null,
    mesReferenciaImpresso: null,
    ...over,
  }
}

describe("parseReciboWhatsapp (validação de domínio, #156)", () => {
  it("test_recibo_valido_passa_intacto", () => {
    const r = parseReciboWhatsapp(
      bruto({
        valorCentavos: 12345,
        dataPagamento: "2026-06-08",
        favorecido: "Enel Distribuicao SP",
        vencimentoImpresso: "2026-06-10",
        mesReferenciaImpresso: "2026-06",
      }),
    )
    expect(r).toEqual({
      valorCentavos: 12345,
      dataPagamento: "2026-06-08",
      favorecido: "Enel Distribuicao SP",
      vencimentoImpresso: "2026-06-10",
      mesReferenciaImpresso: "2026-06",
    })
  })

  it("test_todos_os_campos_ilegiveis_null_preservado", () => {
    // Nada legível: nenhum campo vira palpite; todos os nulos sobrevivem.
    expect(parseReciboWhatsapp(bruto())).toEqual({
      valorCentavos: null,
      dataPagamento: null,
      favorecido: null,
      vencimentoImpresso: null,
      mesReferenciaImpresso: null,
    })
  })

  it("test_array_e_rejeitado_nao_vira_recibo_nulo", () => {
    // Array é `typeof "object"` mas não é o shape do recibo: rejeita, não
    // deixa virar um recibo todo-nulo (que descartaria um comprovante legível).
    expect(() => parseReciboWhatsapp([12345, "2026-06-08"])).toThrow(/objeto/)
  })

  it("test_valor_negativo_e_rejeitado", () => {
    expect(() => parseReciboWhatsapp(bruto({ valorCentavos: -100 }))).toThrow(/centavos/)
  })

  it("test_valor_zero_e_rejeitado", () => {
    // Um comprovante de R$ 0,00 não é um pagamento — ADR-0013 exige > 0.
    expect(() => parseReciboWhatsapp(bruto({ valorCentavos: 0 }))).toThrow(/centavos/)
  })

  it("test_valor_nao_inteiro_e_rejeitado", () => {
    expect(() => parseReciboWhatsapp(bruto({ valorCentavos: 105.5 }))).toThrow(/centavos/)
  })

  it("test_data_pagamento_fora_de_iso_e_rejeitada", () => {
    expect(() => parseReciboWhatsapp(bruto({ dataPagamento: "08/06/2026" }))).toThrow(/ISO/)
  })

  it("test_data_impossivel_e_rejeitada", () => {
    // Formato ISO mas dia inexistente — 31 de fevereiro não é data.
    expect(() => parseReciboWhatsapp(bruto({ dataPagamento: "2026-02-31" }))).toThrow(/ISO/)
  })

  it("test_vencimento_impresso_fora_de_iso_e_rejeitado", () => {
    expect(() => parseReciboWhatsapp(bruto({ vencimentoImpresso: "2026/06/10" }))).toThrow(/ISO/)
  })

  it("test_mes_referencia_fora_de_formato_e_rejeitado", () => {
    // Espera YYYY-MM; "2026-6" (mês sem zero à esquerda) não é aceito.
    expect(() => parseReciboWhatsapp(bruto({ mesReferenciaImpresso: "2026-6" }))).toThrow(/YYYY-MM/)
  })

  it("test_favorecido_so_espacos_vira_null", () => {
    // Espaço em branco não é sinal legível — normaliza a null, não a palpite.
    expect(parseReciboWhatsapp(bruto({ favorecido: "   " })).favorecido).toBeNull()
  })

  it("test_favorecido_e_normalizado_trim", () => {
    expect(parseReciboWhatsapp(bruto({ favorecido: "  Sabesp  " })).favorecido).toBe("Sabesp")
  })
})
