import { describe, expect, it } from "vitest"
import type { Pessoa } from "../domain/household"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { resolveAvatares } from "./resolve-avatares"

/** Seam 1: pura contra o fake do `AttachmentStore` — sem R2, sem banco. */
function pessoa(over: Partial<Pessoa> = {}): Pessoa {
  return {
    id: "u-1",
    nome: "Thiago",
    email: "thiago@casapanini.lar",
    hue: 211,
    inicial: "T",
    avatarKey: null,
    ...over,
  }
}

describe("resolveAvatares (Seam 1)", () => {
  it("test_pessoa_com_avatarkey_resolve_url_assinada_de_leitura", async () => {
    const store = fakeAttachmentStore()

    const [comAvatar] = await resolveAvatares(
      [pessoa({ avatarKey: "identity/users/u-1/avatar" })],
      store,
    )

    expect(comAvatar.avatarUrl).toBe("https://r2.fake/get/identity%2Fusers%2Fu-1%2Favatar")
  })

  it("test_pessoa_sem_avatarkey_fica_com_avatarurl_nulo", async () => {
    const store = fakeAttachmentStore()

    const [semAvatar] = await resolveAvatares([pessoa({ avatarKey: null })], store)

    expect(semAvatar.avatarUrl).toBeNull()
  })

  it("test_preserva_ordem_e_campos_originais_da_pessoa", async () => {
    const store = fakeAttachmentStore()

    const [resultado] = await resolveAvatares([pessoa({ inicial: "J", hue: 14 })], store)

    expect(resultado.inicial).toBe("J")
    expect(resultado.hue).toBe(14)
  })
})
