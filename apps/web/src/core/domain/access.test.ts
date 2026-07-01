import { describe, expect, it } from "vitest"
import { SESSION_MAX_AGE_SEGUNDOS } from "./access"

/**
 * Seam 1: o tempo de vida da sessão (ADR-0004) é política explícita, não o
 * default implícito (~30 dias) do Auth.js. Pinar o valor documenta a intenção
 * e guarda contra regressão silenciosa — a janela do TOCTOU da allowlist
 * (só gateia no `signIn`) é exatamente este maxAge.
 */
describe("SESSION_MAX_AGE_SEGUNDOS (Seam 1 — tempo de vida da sessão)", () => {
  it("test_maxAge_explicito_de_30_dias_em_segundos", () => {
    expect(SESSION_MAX_AGE_SEGUNDOS).toBe(30 * 24 * 60 * 60)
  })

  it("test_maxAge_e_inteiro_positivo_finito", () => {
    expect(Number.isInteger(SESSION_MAX_AGE_SEGUNDOS)).toBe(true)
    expect(SESSION_MAX_AGE_SEGUNDOS).toBeGreaterThan(0)
    expect(Number.isFinite(SESSION_MAX_AGE_SEGUNDOS)).toBe(true)
  })
})
