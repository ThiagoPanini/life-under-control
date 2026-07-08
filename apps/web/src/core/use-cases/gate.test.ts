import { describe, expect, it } from "vitest"
import { gateRedirect, localAuthBypass } from "./gate"

describe("localAuthBypass", () => {
  it("test_bypass_so_existe_em_desenvolvimento_com_opt_in_explicito", () => {
    expect(localAuthBypass("development", "true")).toBe(true)
    expect(localAuthBypass("development", undefined)).toBe(false)
    expect(localAuthBypass("production", "true")).toBe(false)
  })
})

/** A porta (ADR-0004): decisão pura de redirecionamento, testável sem middleware. */
describe("gateRedirect", () => {
  it("test_sem_sessao_rota_protegida_vai_pro_login", () => {
    expect(gateRedirect({ isLoggedIn: false, pathname: "/painel" })).toBe("/login")
    expect(gateRedirect({ isLoggedIn: false, pathname: "/areas/financas" })).toBe("/login")
    expect(gateRedirect({ isLoggedIn: false, pathname: "/" })).toBe("/login")
  })

  it("test_sem_sessao_login_e_api_auth_seguem", () => {
    expect(gateRedirect({ isLoggedIn: false, pathname: "/login" })).toBeNull()
    expect(gateRedirect({ isLoggedIn: false, pathname: "/api/auth/callback/google" })).toBeNull()
  })

  it("test_sem_sessao_webhook_do_whatsapp_segue_a_meta_nao_tem_login", () => {
    expect(gateRedirect({ isLoggedIn: false, pathname: "/api/webhooks/whatsapp" })).toBeNull()
  })

  it("test_sem_sessao_disparo_do_digest_segue_o_cron_autentica_por_segredo", () => {
    expect(gateRedirect({ isLoggedIn: false, pathname: "/api/cron/digest-vencimentos" })).toBeNull()
  })

  it("test_logado_na_porta_ou_landing_vai_pro_painel", () => {
    expect(gateRedirect({ isLoggedIn: true, pathname: "/login" })).toBe("/painel")
    expect(gateRedirect({ isLoggedIn: true, pathname: "/" })).toBe("/painel")
  })

  it("test_logado_em_rota_protegida_segue", () => {
    expect(gateRedirect({ isLoggedIn: true, pathname: "/painel" })).toBeNull()
    expect(gateRedirect({ isLoggedIn: true, pathname: "/areas/carro" })).toBeNull()
  })
})
