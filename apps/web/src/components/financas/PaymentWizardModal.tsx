import type { PaymentFormState } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { ConnectedPaymentForm } from "@/components/financas/ConnectedPaymentForm"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

export function PaymentWizardModal({
  billId,
  billName,
  action,
  pessoas,
  inicial,
  competenciasComLancamento,
  closeHref,
}: {
  billId: string
  billName: string
  action: (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState>
  pessoas: PessoaComAvatar[]
  inicial: PaymentFormInicial
  competenciasComLancamento: string[]
  closeHref: string
}) {
  return (
    <Modal
      title="Registrar pagamento"
      eyebrow={billName}
      description="Um gesto mensal: registre o valor real, a data, a autoria e, se quiser, os comprovantes."
      closeHref={closeHref}
    >
      <ConnectedPaymentForm
        action={action}
        pessoas={pessoas}
        inicial={inicial}
        competenciasComLancamento={competenciasComLancamento}
        wizard
        billId={billId}
        successHref={closeHref}
      />
    </Modal>
  )
}
