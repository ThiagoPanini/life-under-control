import { describe, expect, it } from "vitest"
import { normalizarTelefoneE164 } from "./telefone"

/** Seam 0: normalização pura do telefone BR pro formato E.164 (issue #152). */
describe("normalizarTelefoneE164", () => {
  it("test_numero_com_ddi_e_nono_digito_normaliza", () => {
    expect(normalizarTelefoneE164("+5511987654321")).toBe("+5511987654321")
  })

  it("test_numero_sem_ddi_normaliza", () => {
    expect(normalizarTelefoneE164("11987654321")).toBe("+5511987654321")
  })

  it("test_numero_com_mascara_normaliza", () => {
    expect(normalizarTelefoneE164("(11) 98765-4321")).toBe("+5511987654321")
  })

  it("test_numero_com_ddi_e_mascara_normaliza", () => {
    expect(normalizarTelefoneE164("+55 (11) 98765-4321")).toBe("+5511987654321")
  })

  it("test_numero_fixo_sem_nono_digito_normaliza", () => {
    expect(normalizarTelefoneE164("(11) 3665-4321")).toBe("+551136654321")
  })

  it("test_numero_curto_e_invalido", () => {
    expect(normalizarTelefoneE164("123")).toBeNull()
  })

  it("test_numero_com_letras_e_invalido", () => {
    expect(normalizarTelefoneE164("telefone")).toBeNull()
  })

  it("test_numero_vazio_e_invalido", () => {
    expect(normalizarTelefoneE164("")).toBeNull()
  })

  it("test_numero_longo_demais_e_invalido", () => {
    expect(normalizarTelefoneE164("551198765432199")).toBeNull()
  })
})
