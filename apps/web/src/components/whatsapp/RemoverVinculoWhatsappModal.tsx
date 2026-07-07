"use client"

import Link from "next/link"
import { useFormStatus } from "react-dom"
import { WhatsAppGlyph } from "@/components/areas/WhatsAppGlyph"
import { Modal } from "@/components/ds/Modal"

/**
 * Confirmação antes de remover o vínculo do WhatsApp (side quest #152): um
 * clique só era arriscado demais — o bot para de reconhecer mensagens da
 * Pessoa até vincular de novo. Mesma composição do `ExcluirContaModal`
 * (cartão `narrow`, par Cancelar · Remover em botões de largura igual).
 */
export function RemoverVinculoWhatsappModal({
  telefone,
  action,
  closeHref,
}: {
  telefone: string
  action: () => void | Promise<void>
  closeHref: string
}) {
  return (
    <Modal
      title="Remover vínculo do WhatsApp?"
      description={`O bot para de reconhecer mensagens de ${telefone} até vincular de novo.`}
      icon={
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-luc-danger/[0.14] text-luc-danger">
          <WhatsAppGlyph size={17} />
        </span>
      }
      closeHref={closeHref}
      width="narrow"
    >
      <div className="flex gap-2.5">
        <Link
          href={closeHref}
          replace
          scroll={false}
          className="flex min-h-[38px] flex-1 items-center justify-center rounded-luc-md border border-luc-border-strong bg-luc-surface-2 text-[13px] font-semibold text-luc-text transition-colors hover:border-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
        >
          Cancelar
        </Link>
        <form action={action} className="flex-1">
          <ConfirmarRemocao />
        </form>
      </div>
    </Modal>
  )
}

function ConfirmarRemocao() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[38px] w-full items-center justify-center rounded-luc-md border border-luc-danger/[0.55] bg-luc-danger/[0.16] text-[13px] font-bold text-luc-danger transition-colors hover:bg-luc-danger/[0.26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-danger disabled:opacity-60"
    >
      {pending ? "Removendo…" : "Remover vínculo"}
    </button>
  )
}
