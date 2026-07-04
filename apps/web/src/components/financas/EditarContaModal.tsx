import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { BillIcon } from "@/components/financas/BillIcon"
import { type QuickBillInicial, QuickEditBillForm } from "@/components/financas/QuickEditBillForm"

/**
 * Modal compacto "Editar Conta" (edição rápida pelo lápis do card, #97): abre
 * preenchido com nome, ícone, vencimento simples e logo atuais, no cartão
 * `narrow` do protótipo (400px · padding 18px · overlay com blur). O gesto é
 * curto de propósito — o essencial da Conta num passo só; a regra completa
 * (descrição, periodicidade, âncora, n-ésimo dia útil, deslocamento) segue na
 * página de edição, preservada byte a byte pelo `quickEditBill`.
 */
export function EditarContaModal({
  billId,
  billName,
  billIcon,
  logoUrl,
  inicial,
  action,
  closeHref,
}: {
  billId: string
  billName: string
  /** Nome do ícone da Conta (catálogo `BILL_ICONS`) — chip do header do modal. */
  billIcon: string
  logoUrl: string | null
  inicial: QuickBillInicial
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  closeHref: string
}) {
  return (
    <Modal
      title={billName}
      eyebrow="Editar Conta"
      description="Ajuste o essencial. As regras avançadas seguem na edição completa."
      icon={
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
          <BillIcon name={billIcon} size={15} />
        </span>
      }
      closeHref={closeHref}
      width="narrow"
    >
      <QuickEditBillForm
        billId={billId}
        logoUrl={logoUrl}
        inicial={inicial}
        action={action}
        closeHref={closeHref}
      />
    </Modal>
  )
}
