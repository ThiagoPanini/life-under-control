import { describe, expect, it } from "vitest"
import { type Pessoa, PessoaForaDoLarError } from "../domain/household"
import { fakeUserRepo } from "./user-repo.fake"
import {
  EmailForaDaAllowlistError,
  VinculoEmConflitoError,
  vincularGoogle,
} from "./vincular-google"

/** Seam 1: a operação de vínculo (issue #94) contra o fake do UserRepo. */
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
const ALLOWLIST = "thiago@gmail.com, jakeline@gmail.com"

describe("vincularGoogle (Seam 1)", () => {
  it("test_vincula_email_da_allowlist_a_pessoa_do_lar", async () => {
    const repo = fakeUserRepo([pessoa(), jakeline])

    await vincularGoogle(repo, [pessoa(), jakeline], "u-thiago", "thiago@gmail.com", ALLOWLIST)

    const encontrada = await repo.obterPorGoogleEmail("thiago@gmail.com")
    expect(encontrada?.id).toBe("u-thiago")
  })

  it("test_email_e_normalizado_para_minusculas", async () => {
    const repo = fakeUserRepo([pessoa(), jakeline])

    await vincularGoogle(repo, [pessoa(), jakeline], "u-thiago", "Thiago@GMAIL.com", ALLOWLIST)

    const encontrada = await repo.obterPorGoogleEmail("thiago@gmail.com")
    expect(encontrada?.id).toBe("u-thiago")
    expect(encontrada?.googleEmail).toBe("thiago@gmail.com")
  })

  it("test_email_fora_da_allowlist_lanca_e_nao_altera_dados", async () => {
    const repo = fakeUserRepo([pessoa(), jakeline])

    await expect(
      vincularGoogle(repo, [pessoa(), jakeline], "u-thiago", "intruso@gmail.com", ALLOWLIST),
    ).rejects.toThrow(EmailForaDaAllowlistError)

    expect(await repo.obterPorGoogleEmail("intruso@gmail.com")).toBeNull()
    const thiago = await repo.obterPorEmail("thiago@casapanini.lar")
    expect(thiago?.googleEmail).toBeNull()
  })

  it("test_pessoa_fora_do_lar_lanca", async () => {
    const repo = fakeUserRepo([pessoa(), jakeline])

    await expect(
      vincularGoogle(repo, [pessoa(), jakeline], "u-intrusa", "thiago@gmail.com", ALLOWLIST),
    ).rejects.toThrow(PessoaForaDoLarError)
  })

  it("test_email_ja_vinculado_a_outra_pessoa_lanca_conflito", async () => {
    const repo = fakeUserRepo([pessoa({ googleEmail: "thiago@gmail.com" }), jakeline])

    // Jakeline tentando reivindicar o e-mail já vinculado ao Thiago.
    await expect(
      vincularGoogle(
        repo,
        [pessoa({ googleEmail: "thiago@gmail.com" }), jakeline],
        "u-jakeline",
        "thiago@gmail.com",
        ALLOWLIST,
      ),
    ).rejects.toThrow(VinculoEmConflitoError)
  })

  it("test_revincular_o_mesmo_email_a_mesma_pessoa_e_idempotente", async () => {
    const repo = fakeUserRepo([pessoa({ googleEmail: "thiago@gmail.com" }), jakeline])

    await expect(
      vincularGoogle(
        repo,
        [pessoa({ googleEmail: "thiago@gmail.com" }), jakeline],
        "u-thiago",
        "THIAGO@gmail.com",
        ALLOWLIST,
      ),
    ).resolves.toBeUndefined()

    const encontrada = await repo.obterPorGoogleEmail("thiago@gmail.com")
    expect(encontrada?.id).toBe("u-thiago")
  })
})
