import { describe, expect, it } from "vitest"
import { verificarChallengeWebhook } from "./whatsapp-verificacao-webhook"

/** Seam 0: verificação pura do GET de challenge do webhook (issue #155). */
describe("verificarChallengeWebhook", () => {
  const verifyTokenEsperado = "token-secreto-do-lar"

  it("test_modo_subscribe_e_token_correto_responde_challenge", () => {
    const resultado = verificarChallengeWebhook(
      { mode: "subscribe", token: verifyTokenEsperado, challenge: "12345" },
      verifyTokenEsperado,
    )

    expect(resultado).toEqual({ status: 200, corpo: "12345" })
  })

  it("test_token_errado_e_rejeitado", () => {
    const resultado = verificarChallengeWebhook(
      { mode: "subscribe", token: "token-errado", challenge: "12345" },
      verifyTokenEsperado,
    )

    expect(resultado).toEqual({ status: 403 })
  })

  it("test_modo_diferente_de_subscribe_e_rejeitado", () => {
    const resultado = verificarChallengeWebhook(
      { mode: "unsubscribe", token: verifyTokenEsperado, challenge: "12345" },
      verifyTokenEsperado,
    )

    expect(resultado).toEqual({ status: 403 })
  })

  it("test_parametros_ausentes_sao_rejeitados", () => {
    const resultado = verificarChallengeWebhook(
      { mode: null, token: null, challenge: null },
      verifyTokenEsperado,
    )

    expect(resultado).toEqual({ status: 403 })
  })
})
