import { describe, expect, it } from "vitest"
import { segredoDigestValido } from "./digest-auth"

/** Auth por segredo do disparo do digest (#160) — fail-closed, tempo constante. */
describe("segredoDigestValido", () => {
  it("test_sem_esperado_configurado_fecha", () => {
    expect(segredoDigestValido("Bearer qualquer", undefined)).toBe(false)
    expect(segredoDigestValido("Bearer qualquer", "")).toBe(false)
  })

  it("test_sem_header_fecha", () => {
    expect(segredoDigestValido(null, "s3gr3d0")).toBe(false)
  })

  it("test_header_sem_prefixo_bearer_fecha", () => {
    expect(segredoDigestValido("s3gr3d0", "s3gr3d0")).toBe(false)
  })

  it("test_segredo_errado_fecha", () => {
    expect(segredoDigestValido("Bearer errado", "s3gr3d0")).toBe(false)
  })

  it("test_segredo_certo_abre", () => {
    expect(segredoDigestValido("Bearer s3gr3d0", "s3gr3d0")).toBe(true)
  })
})
