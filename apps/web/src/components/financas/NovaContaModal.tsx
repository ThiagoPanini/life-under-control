"use client"

import { useState } from "react"
import { criarConta } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { ConnectedNovaContaForm } from "@/components/financas/ConnectedNovaContaForm"

export function NovaContaModal({ closeHref }: { closeHref: string }) {
  const [travado, setTravado] = useState(false)

  return (
    <Modal
      title="Nova Conta"
      eyebrow="Finanças · Pagamentos Recorrentes"
      description="Cadastre a regra que se repete. O valor real só aparece quando houver um Lançamento."
      closeHref={closeHref}
      width="narrow"
      travado={travado}
    >
      <ConnectedNovaContaForm
        action={criarConta}
        successHref={closeHref}
        onOperacaoEmAndamento={setTravado}
      />
    </Modal>
  )
}
