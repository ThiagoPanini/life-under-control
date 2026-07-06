import { describe, expect, it } from "vitest"
import type { Pessoa } from "../domain/household"
import { fakeUserRepo } from "./user-repo.fake"
import { PessoaForaDoLarError } from "./vincular-google"
import {
  desvincularTelefone,
  TelefoneEmConflitoError,
  TelefoneInvalidoError,
  vincularTelefone,
} from "./vincular-telefone"

/** Seam 1: vínculo do WhatsApp da Pessoa (issue #152) contra o fake do UserRepo. */
function pessoa(over: Partial<Pessoa> = {}): Pessoa {
  return {
    id: "u-thiago",
    nome: "Thiago",
    email: "thiago@casapanini.lar",
    googleEmail: null,
    hue: 211,
    inicial: "T",
    avatarKey: null,
    ...over,
  }
}

const jakeline = pessoa({ id: "u-jakeline", nome: "Jakeline", inicial: "J", hue: 14 })

describe("vincularTelefone (Seam 1)", () => {
  it("test_vincula_telefone_normalizado_a_pessoa_do_lar", async () => {
    const thiago = pessoa()
    const repo = fakeUserRepo([thiago, jakeline])

    await vincularTelefone(repo, [thiago, jakeline], thiago.id, "(11) 98765-4321")

    const vinculada = await repo.obterPorWhatsappPhone("+5511987654321")
    expect(vinculada?.id).toBe(thiago.id)
  })

  it("test_telefone_invalido_lanca_e_nao_escreve", async () => {
    const thiago = pessoa()
    const repo = fakeUserRepo([thiago, jakeline])

    await expect(vincularTelefone(repo, [thiago, jakeline], thiago.id, "123")).rejects.toThrow(
      TelefoneInvalidoError,
    )
    expect((await repo.obterPorEmail(thiago.email))?.whatsappPhone).toBeUndefined()
  })

  it("test_pessoa_fora_do_lar_lanca", async () => {
    const thiago = pessoa()
    const repo = fakeUserRepo([thiago])

    await expect(vincularTelefone(repo, [thiago], "u-intruso", "11987654321")).rejects.toThrow(
      PessoaForaDoLarError,
    )
  })

  it("test_telefone_ja_vinculado_a_outra_pessoa_lanca_conflito", async () => {
    const thiago = pessoa()
    const repo = fakeUserRepo([thiago, jakeline])
    await vincularTelefone(repo, [thiago, jakeline], thiago.id, "11987654321")

    await expect(
      vincularTelefone(repo, [thiago, jakeline], jakeline.id, "11987654321"),
    ).rejects.toThrow(TelefoneEmConflitoError)
  })

  it("test_revincular_mesmo_telefone_a_mesma_pessoa_e_idempotente", async () => {
    const thiago = pessoa()
    const repo = fakeUserRepo([thiago, jakeline])
    await vincularTelefone(repo, [thiago, jakeline], thiago.id, "11987654321")

    await expect(
      vincularTelefone(repo, [thiago, jakeline], thiago.id, "(11) 98765-4321"),
    ).resolves.not.toThrow()
  })
})

describe("desvincularTelefone (Seam 1)", () => {
  it("test_desvincular_remove_telefone", async () => {
    const thiago = pessoa()
    const repo = fakeUserRepo([thiago, jakeline])
    await vincularTelefone(repo, [thiago, jakeline], thiago.id, "11987654321")

    await desvincularTelefone(repo, [thiago, jakeline], thiago.id)

    expect(await repo.obterPorWhatsappPhone("+5511987654321")).toBeNull()
  })

  it("test_desvincular_pessoa_fora_do_lar_lanca", async () => {
    const thiago = pessoa()
    const repo = fakeUserRepo([thiago])

    await expect(desvincularTelefone(repo, [thiago], "u-intruso")).rejects.toThrow(
      PessoaForaDoLarError,
    )
  })
})
