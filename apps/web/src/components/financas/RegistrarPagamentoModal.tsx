import type { PaymentFormState } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { ConnectedPaymentForm } from "@/components/financas/ConnectedPaymentForm"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

/**
 * Modal compacto "Registrar Lançamento" (Final): aberto direto do bloco do
 * Panorama, com a competência fixa na ocorrência vigente (hidden — o contexto
 * a anuncia), o valor pré-preenchido e os comprovantes opcionais num passo só.
 * O wizard do detalhe da Conta segue existindo para a baixa fora de contexto;
 * aqui o gesto é curto porque o bloco já disse tudo.
 */
export function RegistrarPagamentoModal({
  billId,
  billName,
  action,
  pessoas,
  inicial,
  competenciasComLancamento,
  contexto,
  notaValor,
  closeHref,
  successHref,
}: {
  billId: string
  billName: string
  action: (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState>
  pessoas: PessoaComAvatar[]
  inicial: PaymentFormInicial
  competenciasComLancamento: string[]
  /** "competência julho de 2026 · vence em N dias (dd/mm)" — a ocorrência que o modal baixa. */
  contexto: string
  /** Nota sob o valor: a estimativa pelo histórico; ausente quando a Conta não tem histórico. */
  notaValor?: string
  closeHref: string
  successHref: string
}) {
  return (
    <Modal
      title={billName}
      eyebrow="Registrar Lançamento"
      description={contexto}
      closeHref={closeHref}
      width="compact"
    >
      <ConnectedPaymentForm
        action={action}
        pessoas={pessoas}
        inicial={inicial}
        competenciasComLancamento={competenciasComLancamento}
        compacto
        notaValor={notaValor}
        billId={billId}
        successHref={successHref}
      />
    </Modal>
  )
}
