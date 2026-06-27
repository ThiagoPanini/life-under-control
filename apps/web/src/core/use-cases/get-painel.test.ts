import { describe, expect, it } from "vitest"
import type { Lar } from "../domain/household"
import type { HouseholdRepo } from "../ports/household-repo"
import { getPainel, LarNaoEncontradoError } from "./get-painel"

/** Seam 1: o use-case puro contra um fake do port — sem banco, sem framework. */
function fakeRepo(lar: Lar | null): HouseholdRepo {
  return { carregarLar: async () => lar }
}

const casaPanini: Lar = {
  id: "h-1",
  nome: "Casa Panini",
  pessoas: [
    { id: "u-1", nome: "Thiago", email: "thiago@casapanini.lar", hue: 211, inicial: "T" },
    { id: "u-2", nome: "Jakeline", email: "jakeline@casapanini.lar", hue: 14, inicial: "J" },
  ],
}

describe("getPainel (Seam 1)", () => {
  it("test_lar_com_duas_pessoas_retorna_painel", async () => {
    const { lar } = await getPainel(fakeRepo(casaPanini))

    expect(lar.nome).toBe("Casa Panini")
    expect(lar.pessoas).toHaveLength(2)
    expect(lar.pessoas.map((p) => p.inicial)).toEqual(["T", "J"])
  })

  it("test_sem_lar_lanca_erro_de_dominio", async () => {
    await expect(getPainel(fakeRepo(null))).rejects.toBeInstanceOf(LarNaoEncontradoError)
  })
})
