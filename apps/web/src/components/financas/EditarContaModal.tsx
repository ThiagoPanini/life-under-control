"use client"

import { useActionState, useState } from "react"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { Modal } from "@/components/ds/Modal"
import { BillHeaderChip } from "@/components/financas/BillHeaderChip"
import type { BillFormInicial } from "@/components/financas/bill-form-inicial"
import { CicloDeVidaConta } from "@/components/financas/CicloDeVidaConta"
import { ContaForm } from "@/components/financas/ContaForm"
import type { BillEstado } from "@/core/domain/bill"
import type { DependentesBill } from "@/core/ports/bill-repo"

/** Modal de edição completa: o formulário de tela única do cadastro, seguido do rodapé de ciclo de vida. */
export function EditarContaModal({
  billId,
  billName,
  billIcon,
  logoUrl,
  contexto,
  inicial,
  action,
  closeHref,
  estado,
  encerradaEm,
  hoje,
  dependentes,
}: {
  billId: string
  billName: string
  billIcon: string
  logoUrl: string | null
  contexto: string
  inicial: BillFormInicial
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  closeHref: string
  estado: BillEstado
  encerradaEm: string | null
  /** Data civil de hoje (YYYY-MM-DD) — default editável do encerramento. */
  hoje: string
  /** `null` quando a contagem de dependentes falhou ao carregar. */
  dependentes: DependentesBill | null
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  const [logoEmAndamento, setLogoEmAndamento] = useState(false)
  const [cicloEmAndamento, setCicloEmAndamento] = useState(false)

  return (
    <Modal
      title={billName}
      eyebrow="Editar Conta"
      description={contexto}
      descriptionMono
      icon={<BillHeaderChip icon={billIcon} logoUrl={logoUrl} />}
      closeHref={closeHref}
      width="narrow"
      travado={pending || logoEmAndamento || cicloEmAndamento}
    >
      {/* O Salvar e o rodapé de ciclo de vida mexem na mesma linha da Conta —
          um trava o outro (fieldset) enquanto está em voo, senão correm juntos. */}
      <fieldset disabled={cicloEmAndamento} className="contents">
        <ContaForm
          mode="edit"
          billId={billId}
          logoUrl={logoUrl}
          inicial={inicial}
          formAction={formAction}
          erros={state.erros}
          pending={pending}
          onOperacaoEmAndamento={setLogoEmAndamento}
        />
      </fieldset>
      <CicloDeVidaConta
        billId={billId}
        estado={estado}
        encerradaEm={encerradaEm}
        hoje={hoje}
        dependentes={dependentes}
        closeHref={closeHref}
        travadoExterno={pending || logoEmAndamento}
        onOperacaoEmAndamento={setCicloEmAndamento}
      />
    </Modal>
  )
}
