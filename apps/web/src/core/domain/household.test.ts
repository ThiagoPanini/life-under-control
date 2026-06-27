import { describe, expect, it } from "vitest"
import { coresPessoa } from "./household"

/**
 * Cor da Pessoa derivada do matiz (hue) — invariante de apresentação do Lar.
 * O hue é persistido; fg/bg são derivados (persistir fatos, derivar interpretações).
 */
describe("coresPessoa", () => {
  it("test_hue_211_deriva_cores_do_thiago", () => {
    expect(coresPessoa(211)).toEqual({ fg: "hsl(211 76% 74%)", bg: "hsl(211 44% 23%)" })
  })

  it("test_hue_14_deriva_cores_da_jakeline", () => {
    expect(coresPessoa(14)).toEqual({ fg: "hsl(14 76% 74%)", bg: "hsl(14 44% 23%)" })
  })
})
