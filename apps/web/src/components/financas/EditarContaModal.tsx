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
  contexto,
  inicial,
  action,
  closeHref,
}: {
  billId: string
  billName: string
  /** Nome do ícone da Conta (catálogo `BILL_ICONS`) — chip do header do modal. */
  billIcon: string
  logoUrl: string | null
  /** "recorrência mensal · o valor nasce em cada Lançamento" — a leitura mono do header (Final). */
  contexto: string
  inicial: QuickBillInicial
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  closeHref: string
}) {
  return (
    <Modal
      title={billName}
      eyebrow="Editar Conta"
      description={contexto}
      descriptionMono
      icon={
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-luc-accent-12 text-luc-accent-bright">
          {logoUrl ? (
            // biome-ignore lint/performance/noImgElement: URL assinada volátil; sem domínio fixo pro next/image
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <BillIcon name={billIcon} size={15} />
          )}
        </span>
      }
      closeHref={closeHref}
      width="narrow"
    >
      <QuickEditBillForm billId={billId} logoUrl={logoUrl} inicial={inicial} action={action} />
    </Modal>
  )
}
