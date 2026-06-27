import { describe, expect, it } from "vitest"
import { AllowlistInvalidaError, canSignIn } from "./can-sign-in"

/** Seam 1: a regra da allowlist (ADR-0004) — pura, sem Auth.js nem rede. */
const ALLOW = "thiago@gmail.com, jakeline@gmail.com"

describe("canSignIn (Seam 1 — allowlist)", () => {
  it("test_os_dois_da_allowlist_entram", () => {
    expect(canSignIn("thiago@gmail.com", ALLOW)).toBe(true)
    expect(canSignIn("jakeline@gmail.com", ALLOW)).toBe(true)
  })

  it("test_terceiro_email_e_barrado", () => {
    expect(canSignIn("intruso@gmail.com", ALLOW)).toBe(false)
  })

  it("test_match_e_case_insensitive_e_ignora_espacos", () => {
    expect(canSignIn("Thiago@GMAIL.com", ALLOW)).toBe(true)
    expect(canSignIn("  JAKELINE@gmail.com  ", ALLOW)).toBe(true)
  })

  it("test_allowlist_em_caixa_mista_tambem_normaliza", () => {
    // A normalização vale pros dois lados: config em caixa mista ainda casa.
    expect(canSignIn("thiago@gmail.com", "Thiago@GMAIL.com, JAKELINE@gmail.com")).toBe(true)
  })

  it("test_email_ausente_e_barrado", () => {
    expect(canSignIn(null, ALLOW)).toBe(false)
    expect(canSignIn(undefined, ALLOW)).toBe(false)
  })

  it("test_allowlist_diferente_de_dois_lanca", () => {
    expect(() => canSignIn("a@x.com", "a@x.com")).toThrow(AllowlistInvalidaError)
    expect(() => canSignIn("a@x.com", "a@x.com,b@x.com,c@x.com")).toThrow(AllowlistInvalidaError)
    expect(() => canSignIn("a@x.com", "")).toThrow(AllowlistInvalidaError)
    expect(() => canSignIn("a@x.com", undefined)).toThrow(AllowlistInvalidaError)
  })

  it("test_allowlist_com_email_repetido_conta_como_um_e_lanca", () => {
    // "a@x, A@x" são a mesma Pessoa: 1 e-mail único → não satisfaz "exatamente 2".
    expect(() => canSignIn("a@x.com", "a@x.com, A@x.com")).toThrow(AllowlistInvalidaError)
  })
})
