import { criarConta } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { ConnectedNovaContaForm } from "@/components/financas/ConnectedNovaContaForm"

export function NovaContaModal({ closeHref }: { closeHref: string }) {
  return (
    <Modal
      title="Nova Conta"
      eyebrow="Finanças · Pagamentos Recorrentes"
      description="Cadastre a regra que se repete. O valor real só aparece quando houver um Lançamento."
      closeHref={closeHref}
      width="compact"
    >
      <ConnectedNovaContaForm action={criarConta} successHref={closeHref} />
    </Modal>
  )
}
