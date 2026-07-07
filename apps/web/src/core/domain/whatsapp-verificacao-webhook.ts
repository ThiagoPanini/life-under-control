/**
 * Verificação pura do GET de challenge do webhook da Meta (ADR-0012, issue
 * #155) — `hub.mode`/`hub.verify_token`/`hub.challenge` viram uma resposta,
 * sem tocar `Request`/`Response` do Next.
 */

type ParametrosChallenge = {
  mode: string | null
  token: string | null
  challenge: string | null
}

export type RespostaChallenge = { status: 200; corpo: string } | { status: 403 }

export function verificarChallengeWebhook(
  { mode, token, challenge }: ParametrosChallenge,
  verifyTokenEsperado: string,
): RespostaChallenge {
  if (mode !== "subscribe" || token !== verifyTokenEsperado || challenge === null) {
    return { status: 403 }
  }

  return { status: 200, corpo: challenge }
}
