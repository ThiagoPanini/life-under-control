import { describe, expect, it } from "vitest"
import { ehDataIsoValida } from "@/core/domain/bill"
import { systemClock } from "./system-clock"

/**
 * O adapter usa o relógio real, então não cravamos o valor — afirmamos a *forma*:
 * uma data civil ISO válida (YYYY-MM-DD), no fuso do domínio. O determinismo de
 * cenários datados mora nos use-cases, com um Clock fake (Seam 1).
 */
describe("systemClock", () => {
  it("test_hoje_devolve_data_civil_iso_valida", () => {
    const hoje = systemClock().hoje()
    expect(hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ehDataIsoValida(hoje)).toBe(true)
  })
})
