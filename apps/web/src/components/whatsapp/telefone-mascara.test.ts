import { describe, expect, it } from "vitest"
import { formatarTelefoneParaExibicao, mascararTelefoneEnquantoDigita } from "./telefone-mascara"

describe("mascararTelefoneEnquantoDigita (side quest #152)", () => {
  it("test_vazio_retorna_vazio", () => {
    expect(mascararTelefoneEnquantoDigita("")).toBe("")
  })

  it("test_poucos_digitos_so_abre_parenteses_do_ddd", () => {
    expect(mascararTelefoneEnquantoDigita("11")).toBe("(11")
  })

  it("test_ddd_completo_e_inicio_da_linha", () => {
    expect(mascararTelefoneEnquantoDigita("1198")).toBe("(11) 98")
  })

  it("test_numero_fixo_de_oito_digitos_apos_o_ddd", () => {
    expect(mascararTelefoneEnquantoDigita("1136654321")).toBe("(11) 3665-4321")
  })

  it("test_numero_celular_de_nove_digitos_apos_o_ddd", () => {
    expect(mascararTelefoneEnquantoDigita("11987654321")).toBe("(11) 98765-4321")
  })

  it("test_ignora_caracteres_ja_mascarados_na_entrada", () => {
    expect(mascararTelefoneEnquantoDigita("(11) 98765-4321")).toBe("(11) 98765-4321")
  })

  it("test_trunca_alem_de_onze_digitos", () => {
    expect(mascararTelefoneEnquantoDigita("119876543219999")).toBe("(11) 98765-4321")
  })
})

describe("formatarTelefoneParaExibicao (side quest #152)", () => {
  it("test_remove_ddi_55_e_aplica_mascara_em_celular", () => {
    expect(formatarTelefoneParaExibicao("+5511987654321")).toBe("(11) 98765-4321")
  })

  it("test_remove_ddi_55_e_aplica_mascara_em_fixo", () => {
    expect(formatarTelefoneParaExibicao("+551136654321")).toBe("(11) 3665-4321")
  })
})
