"use client"

import { useActionState } from "react"
import type { PaymentFormState } from "@/app/(app)/areas/financas/actions"
import { PaymentForm } from "@/components/financas/PaymentForm"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"

/**
 * Liga o `PaymentForm` a um server action via `useActionState` (borda fina) — a
 * fiação única da baixa **e** da edição. O Server Component passa o action pronto
 * (`criarLancamento`/`editarLancamento` com os ids ligados no servidor), as
 * Pessoas, os valores iniciais e as competências já lançadas (o aviso). Os
 * rótulos e o `onCancelar` (edição no lugar) são opcionais.
 */
export function ConnectedPaymentForm({
  action,
  pessoas,
  inicial,
  competenciasComLancamento,
  submitLabel,
  submittingLabel,
  onCancelar,
}: {
  action: (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState>
  pessoas: { id: string; nome: string }[]
  inicial: PaymentFormInicial
  competenciasComLancamento?: string[]
  submitLabel?: string
  submittingLabel?: string
  onCancelar?: () => void
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  return (
    <PaymentForm
      formAction={formAction}
      erros={state.erros}
      pending={pending}
      pessoas={pessoas}
      inicial={inicial}
      competenciasComLancamento={competenciasComLancamento}
      submitLabel={submitLabel}
      submittingLabel={submittingLabel}
      onCancelar={onCancelar}
    />
  )
}
