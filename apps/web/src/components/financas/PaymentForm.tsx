"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ds/Button"
import { Field, getFieldError, inputClass } from "@/components/ds/FormField"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { ErroCampo } from "@/core/domain/bill"

/**
 * Formulário de baixa de Lançamento (borda fina — Seam 3). Coleta valor, data de
 * pagamento, Competência e quem pagou, e submete ao server action. Serve a baixa
 * e a edição: o mesmo formulário, mudando só os valores iniciais e os rótulos. A
 * validação-fonte mora no núcleo (`validarDadosPayment`); aqui só há lógica de
 * borda — campos controlados (sobrevivem ao auto-reset do `<form action>` quando
 * o action devolve erro), exibição dos erros e o **aviso** (não-travante) quando
 * a competência escolhida já tem Lançamento. Apresentacional e injetável: recebe
 * `formAction`/`erros`/`pending`, então o teste o exercita sem o action real.
 */

export function PaymentForm({
  formAction,
  pessoas,
  inicial,
  competenciasComLancamento = [],
  erros = [],
  pending = false,
  submitLabel = "Dar baixa",
  submittingLabel = "Registrando…",
  onCancelar,
}: {
  formAction: (formData: FormData) => void
  pessoas: { id: string; nome: string }[]
  inicial: PaymentFormInicial
  /** Competências da Conta que já têm Lançamento — base do aviso de duplicidade. */
  competenciasComLancamento?: string[]
  erros?: ErroCampo[]
  pending?: boolean
  submitLabel?: string
  submittingLabel?: string
  onCancelar?: () => void
}) {
  const [valor, setValor] = useState(inicial.valor)
  const [dataPagamento, setDataPagamento] = useState(inicial.dataPagamento)
  const [competencia, setCompetencia] = useState(inicial.competencia)
  const [paidBy, setPaidBy] = useState(inicial.paidBy)
  const formId = useId()

  const erroDe = (campo: string) => getFieldError(erros, campo)

  // Aviso (não trava): já existe um Lançamento naquela competência?
  const avisaCompetencia = competencia !== "" && competenciasComLancamento.includes(competencia)

  return (
    <form action={formAction} className="flex flex-col gap-5" aria-busy={pending}>
      <Field label="Valor" htmlFor={`${formId}-valor`} error={erroDe("valor")}>
        <input
          id={`${formId}-valor`}
          name="valor"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(erroDe("valor"))}
          aria-describedby={erroDe("valor") ? `${formId}-valor-error` : undefined}
        />
      </Field>

      <Field label="Competência" htmlFor={`${formId}-competencia`} error={erroDe("competencia")}>
        <input
          id={`${formId}-competencia`}
          name="competencia"
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(erroDe("competencia"))}
          aria-describedby={erroDe("competencia") ? `${formId}-competencia-error` : undefined}
        />
        {avisaCompetencia && (
          <p role="status" className="text-luc-warn text-sm leading-snug">
            Já existe um Lançamento nesta competência. Pode registrar mesmo assim.
          </p>
        )}
      </Field>

      <Field label="Data de pagamento" htmlFor={`${formId}-data`} error={erroDe("dataPagamento")}>
        <input
          id={`${formId}-data`}
          name="dataPagamento"
          type="date"
          value={dataPagamento}
          onChange={(e) => setDataPagamento(e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(erroDe("dataPagamento"))}
          aria-describedby={erroDe("dataPagamento") ? `${formId}-data-error` : undefined}
        />
      </Field>

      <Field label="Quem pagou" htmlFor={`${formId}-paidBy`} error={erroDe("paidBy")}>
        <select
          id={`${formId}-paidBy`}
          name="paidBy"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(erroDe("paidBy"))}
          aria-describedby={erroDe("paidBy") ? `${formId}-paidBy-error` : undefined}
        >
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-center justify-end gap-3 pt-1">
        {onCancelar && (
          <Button variant="secondary" type="button" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}
