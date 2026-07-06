"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef } from "react"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { SingleScreenBillForm } from "@/components/financas/SingleScreenBillForm"

/**
 * Liga o `SingleScreenBillForm` ao server action de cadastro via `useActionState`
 * (borda fina). É a fiação do fluxo de **criação** em tela única — mais enxuta que
 * o `ConnectedBillForm` do wizard: aqui a identidade é só o ícone (a metade de logo
 * vem na S8), então não há orquestração de upload nem tela de sucesso; ao receber o
 * `createdBillId` do servidor, redireciona para a lista e a fecha.
 */
export function ConnectedNovaContaForm({
  action,
  successHref = "/areas/financas/pagamentos-recorrentes",
}: {
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  successHref?: string
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  const router = useRouter()
  const feitoRef = useRef<string | null>(null)

  useEffect(() => {
    if (!state.createdBillId || feitoRef.current === state.createdBillId) return
    feitoRef.current = state.createdBillId
    router.replace(successHref)
    router.refresh()
  }, [state.createdBillId, router, successHref])

  return <SingleScreenBillForm formAction={formAction} erros={state.erros} pending={pending} />
}
