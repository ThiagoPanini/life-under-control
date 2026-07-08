import { afterEach, describe, expect, it, vi } from "vitest"

// Sem Postgres: o getDb dos adapters Drizzle vira stub (as fábricas não fazem
// I/O na construção) e o use-case é espiado — o teste exercita só a auth + o fio
// da rota (montagem das deps + Response.json), não a derivação (coberta no Seam 1).
const { enviarSpy } = vi.hoisted(() => ({ enviarSpy: vi.fn() }))
vi.mock("@/adapters/db/client", () => ({ getDb: () => ({}) }))
vi.mock("@/core/use-cases/enviar-digest-vencimentos", () => ({
  enviarDigestVencimentos: enviarSpy,
}))

import { POST } from "./route"

/** Fail-closed do disparo do digest quando o segredo não bate + happy path (#160). */
describe("POST /api/cron/digest-vencimentos — auth por segredo", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    enviarSpy.mockReset()
  })

  function req(auth?: string): Request {
    return new Request("https://luc.panlabs.tech/api/cron/digest-vencimentos", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    })
  }

  it("test_sem_segredo_configurado_fecha_401", async () => {
    vi.stubEnv("DIGEST_CRON_SECRET", "")
    expect((await POST(req("Bearer x"))).status).toBe(401)
    expect(enviarSpy).not.toHaveBeenCalled()
  })

  it("test_segredo_errado_fecha_401", async () => {
    vi.stubEnv("DIGEST_CRON_SECRET", "s3gr3d0")
    expect((await POST(req("Bearer errado"))).status).toBe(401)
    expect(enviarSpy).not.toHaveBeenCalled()
  })

  it("test_sem_header_fecha_401", async () => {
    vi.stubEnv("DIGEST_CRON_SECRET", "s3gr3d0")
    expect((await POST(req())).status).toBe(401)
    expect(enviarSpy).not.toHaveBeenCalled()
  })

  it("test_segredo_certo_dispara_o_digest_e_devolve_o_resultado_200", async () => {
    vi.stubEnv("DIGEST_CRON_SECRET", "s3gr3d0")
    const resultado = { status: "enviado", enviados: 2, jaEnviados: 0, falhas: 0, semTelefone: 0 }
    enviarSpy.mockResolvedValue(resultado)

    const res = await POST(req("Bearer s3gr3d0"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(resultado)
    expect(enviarSpy).toHaveBeenCalledOnce()
  })
})
