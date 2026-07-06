import { emailNaAllowlist, parseAllowlist } from "../domain/access"
import { type Pessoa, PessoaForaDoLarError } from "../domain/household"
import type { UserRepo } from "../ports/user-repo"

/**
 * Operação de vínculo Pessoa ↔ e-mail Google (issue #94). Transacional na
 * intenção: valida TUDO antes de escrever, para não deixar dado meio-vinculado.
 *
 * O vínculo é a ponte entre autorização (allowlist, ADR-0004) e identidade/
 * autoria (`users`, ADR-0002). Regras, nesta ordem:
 * 1. o e-mail Google tem de estar na allowlist (mesma fonte de verdade do login);
 * 2. a Pessoa tem de pertencer ao Lar (escopo — nunca vincular fora dele);
 * 3. o e-mail não pode já pertencer a OUTRA Pessoa (conflito) — revincular à
 *    mesma Pessoa é idempotente.
 * O e-mail é normalizado em minúsculas antes de tudo; a unicidade do banco é
 * então efetivamente case-insensitive. Nunca infere Pessoa por posição (ADR-0002).
 *
 * O e-mail real NÃO vive no repo/fixtures/logs (ADR-0007): esta operação é o
 * mecanismo; a aplicação em produção é o runbook auditável executado pela #96.
 */

/** O e-mail Google não está na allowlist do Lar. */
export class EmailForaDaAllowlistError extends Error {
  constructor(email: string) {
    super(`O e-mail ${email} não está na allowlist do Lar`)
    this.name = "EmailForaDaAllowlistError"
  }
}

/** O e-mail Google já está vinculado a outra Pessoa. */
export class VinculoEmConflitoError extends Error {
  constructor(email: string) {
    super(`O e-mail ${email} já está vinculado a outra Pessoa`)
    this.name = "VinculoEmConflitoError"
  }
}

export async function vincularGoogle(
  userRepo: UserRepo,
  pessoas: Pessoa[],
  pessoaId: string,
  googleEmail: string,
  rawAllowlist: string | null | undefined,
): Promise<void> {
  const email = googleEmail.trim().toLowerCase()

  const allowlist = parseAllowlist(rawAllowlist)
  if (!emailNaAllowlist(email, allowlist)) throw new EmailForaDaAllowlistError(email)

  const pessoa = pessoas.find((p) => p.id === pessoaId)
  if (!pessoa) throw new PessoaForaDoLarError(pessoaId)

  const jaVinculada = await userRepo.obterPorGoogleEmail(email)
  if (jaVinculada && jaVinculada.id !== pessoaId) throw new VinculoEmConflitoError(email)

  await userRepo.vincularGoogleEmail(pessoaId, email)
}
