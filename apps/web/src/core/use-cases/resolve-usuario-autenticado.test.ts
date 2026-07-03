import { describe, expect, it } from "vitest"
import { resolverUsuarioAutenticado } from "./resolve-usuario-autenticado"

const thiago = { email: "thiago@x.com", nome: "Thiago" }
const jakeline = { email: "jakeline@x.com", nome: "Jakeline" }

describe("resolverUsuarioAutenticado (issue #85)", () => {
  it("test_encontra_pessoa_pelo_email_da_sessao_ignorando_caixa", () => {
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], "JAKELINE@X.com")

    expect(usuario).toBe(jakeline)
  })

  it("test_sem_email_de_sessao_cai_na_primeira_pessoa_do_lar", () => {
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], undefined)

    expect(usuario).toBe(thiago)
  })

  it("test_sem_pessoas_do_lar_retorna_indefinido", () => {
    expect(resolverUsuarioAutenticado(undefined, "thiago@x.com")).toBeUndefined()
  })

  it("test_email_de_sessao_que_nao_bate_com_nenhuma_pessoa_retorna_indefinido", () => {
    const usuario = resolverUsuarioAutenticado([thiago, jakeline], "estranho@x.com")

    expect(usuario).toBeUndefined()
  })
})
