"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import type { BillBruto, ErroCampo } from "@/core/domain/bill"
import { BillInvalidaError, createBill } from "@/core/use-cases/create-bill"
import { getPainel } from "@/core/use-cases/get-painel"

/** Estado do formulário entre submissões — só os erros por campo (vazio = ok). */
export type CriarContaState = { erros: ErroCampo[] }

/** Lê um campo numérico do form: vazio/ausente → null; texto inválido → null. */
function numeroOuNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/**
 * Server action de cadastro de Conta (borda fina — ADR-0003). Traduz o FormData
 * em `BillBruto`, resolve o Lar logado (o `householdId` nunca vem do formulário)
 * e chama o use-case `createBill`. Em erro de validação, devolve os erros por
 * campo para o wizard; no sucesso, revalida e volta à lista.
 */
export async function criarConta(
  _prev: CriarContaState,
  formData: FormData,
): Promise<CriarContaState> {
  const descricao = formData.get("descricao")
  const bruto: BillBruto = {
    nome: String(formData.get("nome") ?? ""),
    descricao: descricao ? String(descricao) : null,
    icon: String(formData.get("icon") ?? ""),
    intervalMonths: numeroOuNull(formData.get("intervalMonths")) ?? Number.NaN,
    anchorMonth: numeroOuNull(formData.get("anchorMonth")),
    dueRuleKind: String(formData.get("dueRuleKind") ?? ""),
    dueRuleDay: numeroOuNull(formData.get("dueRuleDay")),
    dueRuleNth: numeroOuNull(formData.get("dueRuleNth")),
    dueMonthOffset: numeroOuNull(formData.get("dueMonthOffset")),
  }

  // Resolve o Lar pelo use-case (não o store direto): a borda fala com use-case
  // (ADR-0003), e LarNaoEncontradoError é a mesma falha que a página já trata.
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await createBill(drizzleBillRepo(), lar.id, bruto)
  } catch (e) {
    if (e instanceof BillInvalidaError) return { erros: e.erros }
    throw e
  }

  revalidatePath("/areas/financas")
  redirect("/areas/financas")
}
