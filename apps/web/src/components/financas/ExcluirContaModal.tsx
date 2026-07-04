"use client"

import { Trash2 } from "lucide-react"
import Link from "next/link"
import { useFormStatus } from "react-dom"
import { Modal } from "@/components/ds/Modal"

/**
 * Modal compacto "Excluir Conta" (#99): a confirmação do gesto rápido da lixeira
 * do card. No domínio é um **encerramento reversível** — a Conta sai do painel e
 * para de projetar, mas Lançamentos, Anexos e logo permanecem (a exclusão
 * destrutiva de fato segue só na zona de risco da edição completa). Segue a
 * composição do protótipo Final: ícone trash-2 num tile danger, título "Excluir
 * {nome}?", a afirmação de que os fatos permanecem e o par Cancelar · Excluir
 * Conta em botões de largura igual. Reusa o cartão `narrow` do Modal (até 400px,
 * overlay com blur, Escape/backdrop/foco/trap do próprio Modal — AC de #99).
 */
export function ExcluirContaModal({
  billName,
  action,
  closeHref,
}: {
  billName: string
  /** Server action (já ligada ao billId) que encerra a Conta na data de hoje. */
  action: (formData: FormData) => void | Promise<void>
  closeHref: string
}) {
  return (
    <Modal
      title={`Excluir ${billName}?`}
      description="A Conta sai do painel. Dá para desfazer."
      icon={
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-luc-danger/[0.14] text-luc-danger">
          <Trash2 aria-hidden size={17} />
        </span>
      }
      closeHref={closeHref}
      width="narrow"
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-luc-text-2">
          Os <strong className="font-semibold text-luc-text">Lançamentos já registrados</strong>{" "}
          <strong className="font-semibold text-luc-text">permanecem</strong> — são fatos do
          histórico. O que sai é a regra de recorrência.
        </p>
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
            <ConfirmarExclusao />
          </form>
        </div>
      </div>
    </Modal>
  )
}

/** Botão de confirmação da exclusão, com estado de envio via useFormStatus. */
function ConfirmarExclusao() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[38px] w-full items-center justify-center rounded-luc-md border border-luc-danger/[0.55] bg-luc-danger/[0.16] text-[13px] font-bold text-luc-danger transition-colors hover:bg-luc-danger/[0.26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-danger disabled:opacity-60"
    >
      {pending ? "Excluindo…" : "Excluir Conta"}
    </button>
  )
}
