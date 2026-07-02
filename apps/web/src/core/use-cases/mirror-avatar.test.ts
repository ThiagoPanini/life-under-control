import { describe, expect, it } from "vitest"
import type { Pessoa } from "../domain/household"
import type { ImageFetcher } from "../ports/image-fetcher"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { mirrorAvatar } from "./mirror-avatar"
import { fakeUserRepo } from "./user-repo.fake"

/** Seam 1: o use-case puro contra fakes dos 3 ports — sem rede, sem banco, sem R2. */
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

const baixaOk: ImageFetcher = async () => ({
  bytes: new Uint8Array([1, 2, 3]),
  tipoMime: "image/jpeg",
})
const baixaFalha: ImageFetcher = async () => null

describe("mirrorAvatar (Seam 1)", () => {
  it("test_baixa_e_grava_e_seta_avatarkey", async () => {
    const repo = fakeUserRepo([pessoa()])
    const store = fakeAttachmentStore()

    await mirrorAvatar(repo, store, baixaOk, "thiago@casapanini.lar", "https://google/foto.jpg")

    const atualizada = await repo.obterPorEmail("thiago@casapanini.lar")
    expect(atualizada?.avatarKey).toBe("identity/users/u-1/avatar")
    expect(store.chaves()).toContain("identity/users/u-1/avatar")
  })

  it("test_falha_no_fetch_mantem_avatarkey_nulo", async () => {
    const repo = fakeUserRepo([pessoa()])
    const store = fakeAttachmentStore()

    await mirrorAvatar(repo, store, baixaFalha, "thiago@casapanini.lar", "https://google/foto.jpg")

    const atualizada = await repo.obterPorEmail("thiago@casapanini.lar")
    expect(atualizada?.avatarKey).toBeNull()
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_sem_picture_url_nao_baixa_nem_toca_avatarkey", async () => {
    const repo = fakeUserRepo([pessoa({ avatarKey: "identity/users/u-1/avatar" })])
    const store = fakeAttachmentStore()
    let chamou = false
    const naoDeveriaChamar: ImageFetcher = async () => {
      chamou = true
      return null
    }

    await mirrorAvatar(repo, store, naoDeveriaChamar, "thiago@casapanini.lar", null)

    expect(chamou).toBe(false)
    const atualizada = await repo.obterPorEmail("thiago@casapanini.lar")
    expect(atualizada?.avatarKey).toBe("identity/users/u-1/avatar")
  })

  it("test_erro_ao_enviar_pro_r2_nao_derruba_mantem_avatarkey_intacto", async () => {
    const repo = fakeUserRepo([pessoa()])
    const store = fakeAttachmentStore()
    store.enviar = async () => {
      throw new Error("R2 fora do ar")
    }

    await expect(
      mirrorAvatar(repo, store, baixaOk, "thiago@casapanini.lar", "https://google/foto.jpg"),
    ).resolves.toBeUndefined()

    const atualizada = await repo.obterPorEmail("thiago@casapanini.lar")
    expect(atualizada?.avatarKey).toBeNull()
  })

  it("test_email_desconhecido_nao_falha", async () => {
    const repo = fakeUserRepo([])
    const store = fakeAttachmentStore()

    await expect(
      mirrorAvatar(repo, store, baixaOk, "estranho@fora.lar", "https://google/foto.jpg"),
    ).resolves.toBeUndefined()
    expect(store.chaves()).toHaveLength(0)
  })
})
