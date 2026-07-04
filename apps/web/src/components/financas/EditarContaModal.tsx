"use client"

import { useState } from "react"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { BillHeaderChip } from "@/components/financas/BillHeaderChip"
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
  // Upload/remoção de logo em curso trava o descarte silencioso (Escape/backdrop)
  // — mesmo contrato do modal de Registrar (#100, AC13): só o X sai no meio.
  const [travado, setTravado] = useState(false)
  return (
    <Modal
      title={billName}
      eyebrow="Editar Conta"
      description={contexto}
      descriptionMono
      icon={<BillHeaderChip icon={billIcon} logoUrl={logoUrl} />}
      closeHref={closeHref}
      width="narrow"
      travado={travado}
    >
      <QuickEditBillForm
        billId={billId}
        logoUrl={logoUrl}
        inicial={inicial}
        action={action}
        onOperacaoEmAndamento={setTravado}
      />
    </Modal>
  )
}
