"use client"

import { useActionState, useId, useState } from "react"
import { useFormStatus } from "react-dom"
import {
  deletarConta,
  type EncerrarContaState,
  encerrarConta,
} from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { inputClass } from "@/components/ds/FormField"
import type { BillEstado } from "@/core/domain/bill"
import type { DependentesBill } from "@/core/ports/bill-repo"

/**
 * Zona de risco da edição de Conta (borda fina): encerrar e deletar. Encerrar só
 * aparece numa Conta `ativa` (encerrar de novo não faz sentido). Deletar é
 * destrutivo e de dois tempos — revela a contagem do que some antes de confirmar.
 */
export function DangerZone({
  billId,
  estado,
  hoje,
  dependentes,
}: {
  billId: string
  estado: BillEstado
  /** Data civil de hoje (YYYY-MM-DD, fuso do domínio) — default editável do encerramento. */
  hoje: string
  dependentes: DependentesBill
}) {
  return (
    <section className="flex flex-col gap-5 rounded-luc-lg border border-luc-warn/20 bg-luc-surface-2 p-5">
      <h2 className="text-sm font-bold text-luc-warn">Zona de risco</h2>

      {estado === "ativa" && <EncerrarBloco billId={billId} hoje={hoje} />}

      <DeletarBloco billId={billId} dependentes={dependentes} />
    </section>
  )
}

/** Encerrar: data civil (default hoje, editável) + submissão ao server action. */
function EncerrarBloco({ billId, hoje }: { billId: string; hoje: string }) {
  const acao = encerrarConta.bind(null, billId)
  const [state, formAction, pending] = useActionState<EncerrarContaState, FormData>(acao, {})
  const id = useId()

  return (
    <form action={formAction} className="flex flex-col gap-3 border-luc-border border-t pt-5">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-luc-text">Encerrar a Conta</span>
        <span className="text-luc-text-3 text-sm leading-snug">
          Ela para de projetar dali pra frente e sai da lista ativa — o histórico fica intacto.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={`${id}-data`} className="flex flex-col gap-1.5">
          <span className="font-medium text-luc-text-2 text-sm">Data de encerramento</span>
          <input
            id={`${id}-data`}
            name="encerradaEm"
            type="date"
            defaultValue={hoje}
            className={inputClass}
          />
        </label>
        <Button variant="secondary" type="submit" disabled={pending}>
          {pending ? "Encerrando…" : "Encerrar"}
        </Button>
      </div>
      {state.erro && (
        <p role="alert" className="text-luc-warn text-sm">
          {state.erro}
        </p>
      )}
    </form>
  )
}

/** Deletar: dois tempos — revela o que some, depois confirma. */
function DeletarBloco({ billId, dependentes }: { billId: string; dependentes: DependentesBill }) {
  const [armado, setArmado] = useState(false)
  const acao = deletarConta.bind(null, billId)

  return (
    <div className="flex flex-col gap-3 border-luc-border border-t pt-5">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-luc-text">Deletar a Conta</span>
        <span className="text-luc-text-3 text-sm leading-snug">{avisoExclusao(dependentes)}</span>
      </div>

      {armado ? (
        <form action={acao} className="flex flex-wrap items-center gap-3">
          <ConfirmarExclusao />
          <Button variant="secondary" type="button" onClick={() => setArmado(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button
          variant="secondary"
          type="button"
          onClick={() => setArmado(true)}
          className="self-start border-luc-warn/40 text-luc-warn hover:border-luc-warn hover:text-luc-warn"
        >
          Deletar Conta
        </Button>
      )}
    </div>
  )
}

/** Botão de submissão da exclusão, com estado de envio via useFormStatus. */
function ConfirmarExclusao() {
  const { pending } = useFormStatus()
  return (
    <Button
      variant="secondary"
      type="submit"
      disabled={pending}
      className="border-luc-warn/40 text-luc-warn hover:border-luc-warn hover:text-luc-warn"
    >
      {pending ? "Deletando…" : "Confirmar exclusão"}
    </Button>
  )
}

/**
 * Aviso da exclusão, honesto quanto à contagem: sem dependentes (o caso de hoje —
 * Lançamentos e Anexos chegam em #19+), diz que some só a Conta, sem fabricar um
 * "0 Lançamentos" enganoso; com dependentes, enumera quanto leva junto.
 */
function avisoExclusao({ lancamentos, anexos }: DependentesBill): string {
  if (lancamentos === 0 && anexos === 0)
    return "Some só a Conta — ela não tem Lançamentos nem Anexos. Não dá pra desfazer."
  return `Apaga a Conta e tudo ligado a ela: ${contar(lancamentos, "Lançamento")} e ${contar(anexos, "Anexo")}. Não dá pra desfazer.`
}

/** Pluraliza a contagem ("1 Lançamento" · "3 Anexos"). */
function contar(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? "" : "s"}`
}
