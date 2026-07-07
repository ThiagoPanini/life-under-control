import { afterEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "./route"

/** Fail-closed do webhook quando os secrets não estão configurados (issue #155). */
describe("GET /api/webhooks/whatsapp — challenge", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("test_sem_verify_token_configurado_fecha_403", () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "")
    const req = new Request(
      "https://luc.panlabs.tech/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123",
    )

    expect(GET(req).status).toBe(403)
  })
})

describe("POST /api/webhooks/whatsapp — assinatura", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("test_sem_app_secret_configurado_fecha_403_antes_de_ler_o_corpo", async () => {
    vi.stubEnv("META_APP_SECRET", "")
    const req = new Request("https://luc.panlabs.tech/api/webhooks/whatsapp", {
      method: "POST",
      body: "{}",
    })

    expect((await POST(req)).status).toBe(403)
  })
})
