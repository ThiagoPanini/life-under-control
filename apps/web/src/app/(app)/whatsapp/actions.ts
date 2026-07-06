"use server"

import { revalidatePath } from "next/cache"
import { pessoaLogada } from "@/adapters/auth/pessoa-logada"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzleUserRepo } from "@/adapters/db/user-repo.drizzle"
import { getPainel } from "@/core/use-cases/get-painel"
import {
  desvincularTelefone,
  TelefoneEmConflitoError,
  TelefoneInvalidoError,
  vincularTelefone,
} from "@/core/use-cases/vincular-telefone"

/** Estado do formulário de vínculo do WhatsApp entre submissões — uma mensagem de erro (vazio = ok). */
export type WhatsappFormState = { erro?: string }

const ROTA_WHATSAPP = "/whatsapp"

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
