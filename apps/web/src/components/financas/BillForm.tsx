"use client"

import { useEffect, useId, useState } from "react"
import { Button } from "@/components/ds/Button"
import { Field, FieldError, getFieldError, inputClass } from "@/components/ds/FormField"
import { BillIcon } from "@/components/financas/BillIcon"
import { type BillFormInicial, INICIAL_PADRAO } from "@/components/financas/bill-form-inicial"
import {
  BILL_ICONS,
  type ErroCampo,
  MESES,
  PERIODICIDADES_PADRAO,
  RECORRENCIA_NOMES,
} from "@/core/domain/bill"

/**
 * Formulário de Conta (borda fina — Seam 3). Coleta nome, descrição, ícone,
 * Recorrência e a regra de vencimento — nunca um valor (invariante #5) — e
 * submete ao server action. Serve cadastro e edição: o mesmo wizard, mudando só
 * os valores iniciais e os rótulos do botão. A validação-fonte mora no núcleo
 * (`validarDadosBill`); aqui só há lógica de borda: passos, campos condicionais
 * e exibição dos erros. Os valores iniciais (e a projeção de uma Conta neles)
 * moram num módulo puro irmão (`bill-form-inicial`), chamável do servidor.
 *
 * Todos os campos são controlados de propósito: o valor digitado sobrevive a
 * trocar de passo, alternar a forma de vencimento e ao auto-reset do `<form
 * action={fn}>` do React 19 quando o action devolve erro em vez de redirecionar.
 *
 * Apresentacional e injetável: recebe `formAction`/`erros`/`pending`, então o
 * teste o exercita sem o server action real.
 */

const FORMAS = [
  { value: "dia-fixo", label: "Dia fixo" },
  { value: "n-esimo-dia-util", label: "N-ésimo dia útil" },
  { value: "ultimo-dia-util", label: "Último dia útil" },
]

const OFFSETS = [
  { value: "0", label: "Mesmo mês da competência" },
  { value: "1", label: "+1 mês (vence no mês seguinte)" },
  { value: "2", label: "+2 meses" },
  { value: "3", label: "+3 meses" },
]

const PASSOS = ["Identidade", "Recorrência", "Vencimento"]

/** Em que passo (0–2) cada campo aparece — para saltar ao 1º erro após submeter. */
const PASSO_DO_CAMPO: Record<string, number> = {
  nome: 0,
  descricao: 0,
  icon: 0,
  intervalMonths: 1,
  anchorMonth: 1,
  dueRuleKind: 2,
  dueRuleDay: 2,
  dueRuleNth: 2,
  dueMonthOffset: 2,
}

export function BillForm({
  formAction,
  erros = [],
  pending = false,
  inicial = INICIAL_PADRAO,
  submitLabel = "Cadastrar Conta",
  submittingLabel = "Cadastrando…",
}: {
  formAction: (formData: FormData) => void
  erros?: ErroCampo[]
  pending?: boolean
  inicial?: BillFormInicial
  submitLabel?: string
  submittingLabel?: string
}) {
  const [passo, setPasso] = useState(0)
  const [nome, setNome] = useState(inicial.nome)
  const [descricao, setDescricao] = useState(inicial.descricao)
  const [icon, setIcon] = useState(inicial.icon)
  const [intervalMonths, setIntervalMonths] = useState(inicial.intervalMonths)
  const [anchorMonth, setAnchorMonth] = useState(inicial.anchorMonth)
  const [dueRuleKind, setDueRuleKind] = useState(inicial.dueRuleKind)
  const [dueRuleDay, setDueRuleDay] = useState(inicial.dueRuleDay)
  const [dueRuleNth, setDueRuleNth] = useState(inicial.dueRuleNth)
  const [dueMonthOffset, setDueMonthOffset] = useState(inicial.dueMonthOffset)
  const formId = useId()

  const precisaAncora = Number(intervalMonths) > 1

  // Após um submit inválido, salta para o passo do primeiro erro.
  useEffect(() => {
    if (erros.length === 0) return
    const passos = erros.map((e) => PASSO_DO_CAMPO[e.campo] ?? 0)
    setPasso(Math.min(...passos))
  }, [erros])

  const erroDe = (campo: string) => getFieldError(erros, campo)

  return (
    <form action={formAction} className="flex flex-col gap-8" aria-busy={pending}>
      <ol className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        {PASSOS.map((titulo, i) => (
          <li
            key={titulo}
            aria-current={i === passo ? "step" : undefined}
            className={`flex items-center gap-1.5 ${
              i === passo ? "text-luc-accent" : i < passo ? "text-luc-success" : "text-luc-text-3"
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[9px] ${
                i === passo
                  ? "border-luc-accent bg-luc-accent-12"
                  : i < passo
                    ? "border-luc-success/30 bg-luc-success/10"
                    : "border-luc-border bg-luc-surface-2"
              }`}
            >
              {i + 1}
            </span>
            {titulo}
            {i < PASSOS.length - 1 && <span className="ml-1 text-luc-faint">/</span>}
          </li>
        ))}
      </ol>

      {/* Passo 1 — Identidade */}
      <fieldset hidden={passo !== 0} className="flex flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Identidade</legend>

        <Field label="Nome" htmlFor={`${formId}-nome`} error={erroDe("nome")}>
          <input
            id={`${formId}-nome`}
            name="nome"
            type="text"
            maxLength={80}
            autoComplete="off"
            placeholder="Condomínio, Luz, Internet…"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erroDe("nome"))}
            aria-describedby={erroDe("nome") ? `${formId}-nome-error` : undefined}
          />
        </Field>

        <Field
          label="Descrição (opcional)"
          htmlFor={`${formId}-descricao`}
          error={erroDe("descricao")}
        >
          <textarea
            id={`${formId}-descricao`}
            name="descricao"
            rows={2}
            maxLength={280}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className={`${inputClass} resize-none`}
            aria-invalid={Boolean(erroDe("descricao"))}
            aria-describedby={erroDe("descricao") ? `${formId}-descricao-error` : undefined}
          />
        </Field>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">Ícone</legend>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {BILL_ICONS.map((ic) => (
              <label
                key={ic}
                className={`flex aspect-square cursor-pointer items-center justify-center rounded-luc-md border transition-colors ${
                  icon === ic
                    ? "border-luc-accent bg-luc-accent-12 text-luc-accent-bright"
                    : "border-luc-border bg-luc-surface-2 text-luc-text-2 hover:border-luc-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="icon"
                  value={ic}
                  checked={icon === ic}
                  onChange={() => setIcon(ic)}
                  className="sr-only"
                />
                <BillIcon name={ic} size={20} />
                <span className="sr-only">{ic}</span>
              </label>
            ))}
          </div>
          {erroDe("icon") && <FieldError>{erroDe("icon")}</FieldError>}
        </fieldset>
      </fieldset>

      {/* Passo 2 — Recorrência */}
      <fieldset hidden={passo !== 1} className="flex flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Recorrência</legend>

        <Field
          label="Periodicidade"
          htmlFor={`${formId}-intervalo`}
          error={erroDe("intervalMonths")}
        >
          <select
            id={`${formId}-intervalo`}
            name="intervalMonths"
            value={intervalMonths}
            onChange={(e) => setIntervalMonths(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erroDe("intervalMonths"))}
          >
            {PERIODICIDADES_PADRAO.map((m) => (
              <option key={m} value={m}>
                {RECORRENCIA_NOMES[m]}
              </option>
            ))}
          </select>
        </Field>

        {precisaAncora && (
          <Field label="Mês-âncora" htmlFor={`${formId}-ancora`} error={erroDe("anchorMonth")}>
            <select
              id={`${formId}-ancora`}
              name="anchorMonth"
              value={anchorMonth}
              onChange={(e) => setAnchorMonth(e.target.value)}
              className={inputClass}
              aria-invalid={Boolean(erroDe("anchorMonth"))}
            >
              <option value="" disabled>
                Em que mês cai?
              </option>
              {MESES.map((mes, i) => (
                <option key={mes} value={i + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </Field>
        )}
      </fieldset>

      {/* Passo 3 — Vencimento */}
      <fieldset hidden={passo !== 2} className="flex flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Vencimento</legend>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">
            Forma de vencimento
          </legend>
          <div className="flex flex-col gap-2">
            {FORMAS.map((f) => (
              <label
                key={f.value}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-luc-md border px-3 transition-colors ${
                  dueRuleKind === f.value
                    ? "border-luc-accent bg-luc-accent-12 text-luc-text"
                    : "border-luc-border bg-luc-surface-2 text-luc-text-2 hover:border-luc-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="dueRuleKind"
                  value={f.value}
                  checked={dueRuleKind === f.value}
                  onChange={() => setDueRuleKind(f.value)}
                  className="accent-luc-accent"
                />
                {f.label}
              </label>
            ))}
          </div>
          {erroDe("dueRuleKind") && <FieldError>{erroDe("dueRuleKind")}</FieldError>}
        </fieldset>

        {dueRuleKind === "dia-fixo" && (
          <Field label="Dia do mês" htmlFor={`${formId}-dia`} error={erroDe("dueRuleDay")}>
            <input
              id={`${formId}-dia`}
              name="dueRuleDay"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              value={dueRuleDay}
              onChange={(e) => setDueRuleDay(e.target.value)}
              className={inputClass}
              aria-invalid={Boolean(erroDe("dueRuleDay"))}
            />
          </Field>
        )}

        {dueRuleKind === "n-esimo-dia-util" && (
          <Field label="Dia útil nº" htmlFor={`${formId}-nth`} error={erroDe("dueRuleNth")}>
            <input
              id={`${formId}-nth`}
              name="dueRuleNth"
              type="number"
              min={1}
              max={23}
              inputMode="numeric"
              value={dueRuleNth}
              onChange={(e) => setDueRuleNth(e.target.value)}
              className={inputClass}
              aria-invalid={Boolean(erroDe("dueRuleNth"))}
            />
          </Field>
        )}

        <Field
          label="Offset de vencimento"
          htmlFor={`${formId}-offset`}
          error={erroDe("dueMonthOffset")}
        >
          <select
            id={`${formId}-offset`}
            name="dueMonthOffset"
            value={dueMonthOffset}
            onChange={(e) => setDueMonthOffset(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erroDe("dueMonthOffset"))}
          >
            {OFFSETS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <div className="flex items-center justify-between gap-3 border-luc-border border-t pt-5">
        <Button
          variant="secondary"
          onClick={() => setPasso((p) => Math.max(0, p - 1))}
          disabled={passo === 0}
          className={passo === 0 ? "invisible" : ""}
        >
          ← Voltar
        </Button>

        {passo < PASSOS.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => setPasso((p) => Math.min(PASSOS.length - 1, p + 1))}
          >
            Próximo →
          </Button>
        ) : (
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? submittingLabel : submitLabel}
          </Button>
        )}
      </div>
    </form>
  )
}
