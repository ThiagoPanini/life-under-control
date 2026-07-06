"use client"

import { useActionState, useEffect, useId, useState } from "react"
import {
  deletarConta,
  type EncerrarContaState,
  encerrarConta,
  reativarConta,
} from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { inputClass } from "@/components/ds/FormField"
import { type BillEstado, formatarDataBr } from "@/core/domain/bill"
import type { DependentesBill } from "@/core/ports/bill-repo"

/**
 * Rodapé de ciclo de vida da edição de Conta (borda fina): encerrar/reativar
 * conforme o estado, e deletar numa zona de risco apartada. Só aparece no modo
 * edição — o cadastro não tem ciclo de vida. O `fieldset` trava tudo aqui
 * enquanto QUALQUER mutação (a própria ou o Salvar do `ContaForm`, via
 * `travadoExterno`) está em voo — as ações mexem na mesma linha da Conta e não
 * podem correr concorrentes (perderiam a corrida silenciosamente).
 */
export function CicloDeVidaConta({
  billId,
  estado,
  encerradaEm,
  hoje,
  dependentes,
  closeHref,
  travadoExterno = false,
  onOperacaoEmAndamento,
}: {
  billId: string
  estado: BillEstado
  encerradaEm: string | null
  /** Data civil de hoje (YYYY-MM-DD, fuso do domínio) — default editável do encerramento. */
  hoje: string
  /** `null` quando a contagem de dependentes falhou ao carregar — deletar fica bloqueado até recarregar. */
  dependentes: DependentesBill | null
  /** Pra onde encerrar/reativar voltam ao concluir (o mesmo `closeHref` do modal). */
  closeHref: string
  /** O Salvar do `ContaForm` já está em voo — trava tudo aqui também. */
  travadoExterno?: boolean
  /** Reporta pro modal quando UMA ação daqui está em voo — trava o Salvar e o Escape/backdrop junto. */
  onOperacaoEmAndamento?: (emAndamento: boolean) => void
}) {
  const acaoEncerrar = encerrarConta.bind(null, billId, closeHref)
  const [stateEncerrar, formActionEncerrar, pendingEncerrar] = useActionState<
    EncerrarContaState,
    FormData
  >(acaoEncerrar, {})

  const acaoReativar = reativarConta.bind(null, billId, closeHref)
  const [, formActionReativar, pendingReativar] = useActionState<null, FormData>(async () => {
    await acaoReativar()
    return null
  }, null)

  const acaoDeletar = deletarConta.bind(null, billId)
  const [, formActionDeletar, pendingDeletar] = useActionState<null, FormData>(async () => {
    await acaoDeletar()
    return null
  }, null)

  const [armado, setArmado] = useState(false)
  const algumPendente = pendingEncerrar || pendingReativar || pendingDeletar

  useEffect(() => {
    onOperacaoEmAndamento?.(algumPendente)
  }, [algumPendente, onOperacaoEmAndamento])

  return (
    <fieldset disabled={travadoExterno || algumPendente} className="contents">
      <div className="flex flex-col gap-5 border-luc-border border-t pt-5">
        {estado === "ativa" ? (
          <EncerrarBloco
            hoje={hoje}
            formAction={formActionEncerrar}
            pending={pendingEncerrar}
            erro={stateEncerrar.erro}
          />
        ) : (
          <ReativarBloco
            encerradaEm={encerradaEm}
            formAction={formActionReativar}
            pending={pendingReativar}
          />
        )}

        <section className="flex flex-col gap-3 rounded-luc-lg border border-luc-warn/20 bg-luc-surface-2 p-5">
          <h2 className="text-sm font-bold text-luc-warn">Zona de risco</h2>
          <DeletarBloco
            dependentes={dependentes}
            armado={armado}
            onArmar={() => setArmado(true)}
            onCancelar={() => setArmado(false)}
            formAction={formActionDeletar}
            pending={pendingDeletar}
          />
        </section>
      </div>
    </fieldset>
  )
}

/** Encerrar: data civil (default hoje, editável) + submissão ao server action. */
function EncerrarBloco({
  hoje,
  formAction,
  pending,
  erro,
}: {
  hoje: string
  formAction: (formData: FormData) => void
  pending: boolean
  erro?: string
}) {
  const id = useId()

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
      {erro && (
        <p role="alert" className="text-luc-warn text-sm">
          {erro}
        </p>
      )}
    </form>
  )
}

/**
 * Reativar: controle persistente pra Conta encerrada — tapa o buraco do Undo do
 * toast (~4,2s). Reativação é atômica e não pede confirmação (é não-destrutiva).
 */
function ReativarBloco({
  encerradaEm,
  formAction,
  pending,
}: {
  encerradaEm: string | null
  formAction: (formData: FormData) => void
  pending: boolean
}) {
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-luc-text">
          {encerradaEm ? `Encerrada em ${formatarDataBr(encerradaEm)}` : "Conta encerrada"}
        </span>
        <span className="text-luc-text-3 text-sm leading-snug">
          Ela não projeta mais — reative para ela voltar à lista ativa.
        </span>
      </div>
      <Button variant="secondary" type="submit" disabled={pending} className="self-start">
        {pending ? "Reativando…" : "Reativar"}
      </Button>
    </form>
  )
}

/** Deletar: dois tempos — revela o que some, depois confirma. */
function DeletarBloco({
  dependentes,
  armado,
  onArmar,
  onCancelar,
  formAction,
  pending,
}: {
  dependentes: DependentesBill | null
  armado: boolean
  onArmar: () => void
  onCancelar: () => void
  formAction: (formData: FormData) => void
  pending: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-luc-text">Deletar a Conta</span>
        <span className="text-luc-text-3 text-sm leading-snug">{avisoExclusao(dependentes)}</span>
      </div>

      {armado ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            type="submit"
            disabled={pending}
            className="border-luc-warn/40 text-luc-warn hover:border-luc-warn hover:text-luc-warn"
          >
            {pending ? "Deletando…" : "Confirmar exclusão"}
          </Button>
          <Button variant="secondary" type="button" onClick={onCancelar}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button
          variant="secondary"
          type="button"
          onClick={onArmar}
          disabled={!dependentes}
          className="self-start border-luc-warn/40 text-luc-warn hover:border-luc-warn hover:text-luc-warn"
        >
          Deletar Conta
        </Button>
      )}
    </div>
  )
}

/**
 * Aviso da exclusão, honesto quanto à contagem: sem dependentes, diz que some só
 * a Conta; com só um dos dois tipos, menciona só o que existe (nunca fabrica um
 * "0 Anexos"); com os dois, enumera ambos. `null` (a contagem falhou ao
 * carregar) bloqueia o armar — melhor não confirmar do que confirmar errado.
 */
function avisoExclusao(dependentes: DependentesBill | null): string {
  if (!dependentes)
    return "Não deu pra confirmar o que a exclusão leva junto — recarregue e tente de novo."
  const { lancamentos, anexos } = dependentes
  if (lancamentos === 0 && anexos === 0)
    return "Some só a Conta — ela não tem Lançamentos nem Anexos. Não dá pra desfazer."
  const partes = [
    lancamentos > 0 ? contar(lancamentos, "Lançamento") : null,
    anexos > 0 ? contar(anexos, "Anexo") : null,
  ].filter((parte): parte is string => parte !== null)
  return `Apaga a Conta e tudo ligado a ela: ${partes.join(" e ")}. Não dá pra desfazer.`
}

/** Pluraliza a contagem ("1 Lançamento" · "3 Anexos"). */
function contar(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? "" : "s"}`
}
