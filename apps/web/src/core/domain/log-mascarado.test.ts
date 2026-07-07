import { describe, expect, it } from "vitest"
import { mascararTelefone } from "./log-mascarado"

/** Seam 0: mascaramento de telefone pra log auditável (issue #155 — "logs sem token e sem número completo"). */
describe("mascararTelefone", () => {
  it("test_numero_e164_mascara_meio_preserva_ddi_e_ultimos_2_digitos", () => {
    expect(mascararTelefone("+5511987654321")).toBe("+55*********21")
  })

  it("test_numero_fixo_sem_nono_digito_mascara", () => {
    expect(mascararTelefone("+551136654321")).toBe("+55********21")
  })

  it("test_numero_curto_demais_mascara_tudo", () => {
    expect(mascararTelefone("+551")).toBe("+***")
  })

  it("test_numero_vazio_devolve_vazio", () => {
    expect(mascararTelefone("")).toBe("")
  })
})
