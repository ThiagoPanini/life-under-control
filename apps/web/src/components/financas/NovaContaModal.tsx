import { criarConta } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { ConnectedBillForm } from "@/components/financas/ConnectedBillForm"

export function NovaContaModal({ closeHref }: { closeHref: string }) {
  return (
    <Modal
      title="Nova Conta"
      eyebrow="Finanças · Pagamentos Recorrentes"
      description="Cadastre a regra que se repete. O valor real só aparece quando houver um Lançamento."
      closeHref={closeHref}
    >
      <ConnectedBillForm action={criarConta} createMode successHref={closeHref} />
    </Modal>
  )
}
