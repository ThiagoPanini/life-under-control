"use client"

import { useActionState } from "react"
import { criarConta } from "@/app/(app)/areas/financas/actions"
import { BillForm } from "@/components/financas/BillForm"

/** Liga o wizard ao server action de cadastro (useActionState) — borda fina. */
export function BillWizard() {
  const [state, formAction, pending] = useActionState(criarConta, { erros: [] })
  return <BillForm formAction={formAction} erros={state.erros} pending={pending} />
}
