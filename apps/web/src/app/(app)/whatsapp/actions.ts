"use server"

import { revalidatePath } from "next/cache"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzleUserRepo } from "@/adapters/db/user-repo.drizzle"
import { auth } from "@/auth"
import type { Pessoa } from "@/core/domain/household"
import { localAuthBypass } from "@/core/use-cases/gate"
import { getPainel } from "@/core/use-cases/get-painel"
import { resolverUsuarioAutenticado } from "@/core/use-cases/resolve-usuario-autenticado"
import {
  desvincularTelefone,
  TelefoneEmConflitoError,
  TelefoneInvalidoError,
  vincularTelefone,
} from "@/core/use-cases/vincular-telefone"

/** Estado do formulário de vínculo do WhatsApp entre submissões — uma mensagem de erro (vazio = ok). */
export type WhatsappFormState = { erro?: string }

const ROTA_WHATSAPP = "/whatsapp"

/**
 * A Pessoa logada, resolvida do mesmo jeito da casca (issue #94): casa pelo
 * e-mail Google vinculado. `undefined` (sessão real sem vínculo) nunca cai na
 * 1ª Pessoa — diferente do upload de comprovante, aqui é autorização "só o
 * próprio" sobre a identidade da própria Pessoa, não um FK secundário.
 */
async function pessoaLogada(pessoas: Pessoa[]): Promise<Pessoa | undefined> {
  const bypass = localAuthBypass(
    process.env.NODE_ENV ?? "development",
    process.env.LUC_LOCAL_AUTH_BYPASS,
  )
  const email = bypass ? undefined : (await auth())?.user?.email
  return resolverUsuarioAutenticado(pessoas, email, bypass)
}

/** Server action: vincula/troca o WhatsApp da Pessoa logada (nunca de outra). */
export async function vincularMeuWhatsapp(
  _prev: WhatsappFormState,
  formData: FormData,
): Promise<WhatsappFormState> {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const pessoa = await pessoaLogada(lar.pessoas)
  if (!pessoa) return { erro: "Sessão sem Pessoa vinculada — não é possível editar o WhatsApp." }

  const telefoneBruto = String(formData.get("telefone") ?? "")
  try {
    await vincularTelefone(drizzleUserRepo(), lar.pessoas, pessoa.id, telefoneBruto)
  } catch (e) {
    if (e instanceof TelefoneInvalidoError) {
      return { erro: "Telefone inválido — confira o DDD e o número." }
    }
    if (e instanceof TelefoneEmConflitoError) {
      return { erro: "Esse número já está vinculado à outra Pessoa do Lar." }
    }
    throw e
  }

  revalidatePath(ROTA_WHATSAPP)
  return {}
}

/** Server action: remove o WhatsApp vinculado da Pessoa logada. */
export async function desvincularMeuWhatsapp(): Promise<void> {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const pessoa = await pessoaLogada(lar.pessoas)
  if (!pessoa) return

  await desvincularTelefone(drizzleUserRepo(), lar.pessoas, pessoa.id)
  revalidatePath(ROTA_WHATSAPP)
}
