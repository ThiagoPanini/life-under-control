import { describe, expect, it } from "vitest"
import { resolverUsuarioAutenticado } from "./resolve-usuario-autenticado"

const thiago = { googleEmail: "thiago@gmail.com", nome: "Thiago" }
const jakeline = { googleEmail: "jakeline@gmail.com", nome: "Jakeline" }
const semVinculo = { googleEmail: null, nome: "Órfã" }

describe("resolverUsuarioAutenticado (issue #94)", () => {
  it("test_sessao_vinculada_resolve_a_pessoa_correta", () => {
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], "jakeline@gmail.com", false)

    expect(usuario).toBe(jakeline)
  })

  it("test_match_do_google_email_e_case_insensitive", () => {
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], "JAKELINE@Gmail.com", false)

    expect(usuario).toBe(jakeline)
  })

  it("test_pessoa_sem_google_email_nunca_casa", () => {
    expect(resolverUsuarioAutenticado([semVinculo], "orfa@gmail.com", false)).toBeUndefined()
  })

  it("test_sessao_real_sem_vinculo_em_producao_nao_resolve_e_nao_pega_a_primeira", () => {
    // bypass desligado (produção): sessão válida sem vínculo → undefined, NUNCA a primeira Pessoa.
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], "estranho@gmail.com", false)

    expect(usuario).toBeUndefined()
  })

  it("test_sem_sessao_com_bypass_local_usa_primeira_pessoa", () => {
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], undefined, true)

    expect(usuario).toBe(thiago)
  })

  it("test_sem_sessao_sem_bypass_nao_resolve", () => {
    expect(resolverUsuarioAutenticado([thiago, jakeline], null, false)).toBeUndefined()
  })

  it("test_sessao_sem_vinculo_com_bypass_tolera_e_cai_na_primeira", () => {
    // Em dev, um e-mail de sessão que não casa ainda pode operar contra o seed local.
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], "estranho@gmail.com", true)

    expect(usuario).toBe(thiago)
  })

  it("test_lar_sem_pessoas_devolve_undefined", () => {
    expect(resolverUsuarioAutenticado([], "thiago@gmail.com", true)).toBeUndefined()
    expect(resolverUsuarioAutenticado(undefined, null, true)).toBeUndefined()
  })
})
