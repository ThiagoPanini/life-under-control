import type { Pessoa } from "../domain/household"
import { normalizarTelefoneE164 } from "../domain/telefone"
import type { UserRepo } from "../ports/user-repo"
import { PessoaForaDoLarError } from "./vincular-google"

/**
 * Operação de vínculo Pessoa ↔ WhatsApp (issue #152, ADR-0012). Mesma forma do
 * vínculo Google (#94): valida TUDO antes de escrever. A coluna é a allowlist
 * da borda de ingestão — não há verificação externa aqui, só formato e
 * unicidade.
 */

/** O telefone informado não é um número BR válido. */
export class TelefoneInvalidoError extends Error {
  constructor(bruto: string) {
    super(`O telefone ${bruto} não é um número BR válido`)
    this.name = "TelefoneInvalidoError"
  }
}

/** O telefone já está vinculado a outra Pessoa do Lar. */
export class TelefoneEmConflitoError extends Error {
  constructor(telefone: string) {
    super(`O telefone ${telefone} já está vinculado a outra Pessoa`)
    this.name = "TelefoneEmConflitoError"
  }
}

export async function vincularTelefone(
  userRepo: UserRepo,
  pessoas: Pessoa[],
  pessoaId: string,
  telefoneBruto: string,
): Promise<void> {
  const pessoa = pessoas.find((p) => p.id === pessoaId)
  if (!pessoa) throw new PessoaForaDoLarError(pessoaId)

  const telefone = normalizarTelefoneE164(telefoneBruto)
  if (!telefone) throw new TelefoneInvalidoError(telefoneBruto)

  const jaVinculado = await userRepo.obterPorWhatsappPhone(telefone)
  if (jaVinculado && jaVinculado.id !== pessoaId) throw new TelefoneEmConflitoError(telefone)

  await userRepo.vincularWhatsappPhone(pessoaId, telefone)
}

export async function desvincularTelefone(
  userRepo: UserRepo,
  pessoas: Pessoa[],
  pessoaId: string,
): Promise<void> {
  const pessoa = pessoas.find((p) => p.id === pessoaId)
  if (!pessoa) throw new PessoaForaDoLarError(pessoaId)

  await userRepo.desvincularWhatsappPhone(pessoaId)
}
