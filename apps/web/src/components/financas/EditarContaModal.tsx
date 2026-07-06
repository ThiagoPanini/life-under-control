"use client"

import { useActionState, useState } from "react"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { BillHeaderChip } from "@/components/financas/BillHeaderChip"
import type { BillFormInicial } from "@/components/financas/bill-form-inicial"
import { ContaForm } from "@/components/financas/ContaForm"

/** Modal de edição completa: o mesmo formulário de tela única usado no cadastro. */
export function EditarContaModal({
  billId,
  billName,
  billIcon,
  logoUrl,
  contexto,
  inicial,
  action,
  closeHref,
}: {
  billId: string
  billName: string
  billIcon: string
  logoUrl: string | null
  contexto: string
  inicial: BillFormInicial
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  closeHref: string
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  const [logoEmAndamento, setLogoEmAndamento] = useState(false)

  return (
    <Modal
      title={billName}
      eyebrow="Editar Conta"
      description={contexto}
      descriptionMono
      icon={<BillHeaderChip icon={billIcon} logoUrl={logoUrl} />}
      closeHref={closeHref}
      width="narrow"
      travado={pending || logoEmAndamento}
    >
      <ContaForm
        mode="edit"
        billId={billId}
        logoUrl={logoUrl}
        inicial={inicial}
        formAction={formAction}
        erros={state.erros}
        pending={pending}
        onOperacaoEmAndamento={setLogoEmAndamento}
      />
    </Modal>
  )
}
