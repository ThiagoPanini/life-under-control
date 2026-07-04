"use client"

import { useState } from "react"
import type { PaymentFormState } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { BillHeaderChip } from "@/components/financas/BillHeaderChip"
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
  billIcon,
  logoUrl,
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
  /** Nome do ícone da Conta (catálogo `BILL_ICONS`) — chip do header do modal compacto. */
  billIcon: string
  /** Logo da Conta (URL assinada); no header, substitui o ícone dentro do mesmo chip (AC1). */
  logoUrl: string | null
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
  // Enquanto a baixa finaliza (Lançamento criado, uploads/decisão pendentes), o
  // modal trava o descarte silencioso — só o X, os botões da tela de progresso ou
  // o sucesso o fecham (#100, AC10/AC13).
  const [travado, setTravado] = useState(false)
  return (
    <Modal
      title={billName}
      eyebrow="Registrar Lançamento"
      description={contexto}
      descriptionMono
      icon={<BillHeaderChip icon={billIcon} logoUrl={logoUrl} />}
      closeHref={closeHref}
      width="narrow"
      travado={travado}
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
        closeHref={closeHref}
        onOperacaoEmAndamento={setTravado}
      />
    </Modal>
  )
}
