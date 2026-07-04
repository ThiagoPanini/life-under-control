"use client"

import { useRouter } from "next/navigation"
import { useActionState, useId, useState } from "react"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { Field, FieldError, getFieldError, inputClass } from "@/components/ds/FormField"
import { BillIcon } from "@/components/financas/BillIcon"
import { BillLogoPicker } from "@/components/financas/BillLogoPicker"
import { BILL_ICONS, type DueRuleKind } from "@/core/domain/bill"

/**
 * Os campos-string que a edição rápida pré-preenche: nome, ícone e a regra de
 * vencimento atual (para escolher o rádio certo e prover o dia quando dia-fixo).
 */
export type QuickBillInicial = {
  nome: string
  icon: string
  dueRuleKind: DueRuleKind
  dueRuleDay: string
}

/** As formas simples que o modal compacto sabe editar (a avançada só é preservada). */
const FORMAS_SIMPLES = [
  { value: "dia-fixo", label: "Dia fixo" },
  { value: "ultimo-dia-util", label: "Último dia útil" },
]

/**
 * Formulário compacto da edição rápida de uma Conta (o lápis do card). Coleta só
 * a allowlist — nome, ícone, vencimento simples (dia fixo · último dia útil) e
 * logo. As regras avançadas (descrição, periodicidade, âncora, n-ésimo dia útil,
 * deslocamento) **não aparecem** aqui: seguem na edição completa e são
 * preservadas byte a byte pelo `quickEditBill`. Quando a regra atual é avançada,
 * o rádio "Manter regra atual" vem selecionado e submete sem tocar o vencimento.
 *
 * O logo reaproveita o `BillLogoPicker` (a Conta já existe): sobe/troca/remove
 * pelo fluxo de URL assinada, com progresso e recuperação de falha, sem passar
 * pela submissão do formulário — então falhar no logo não perde os demais campos.
 */
export function QuickEditBillForm({
  billId,
  logoUrl,
  inicial,
  action,
  closeHref,
}: {
  billId: string
  logoUrl: string | null
  inicial: QuickBillInicial
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  closeHref: string
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  const router = useRouter()
  const formId = useId()
  const regraAvancada = inicial.dueRuleKind === "n-esimo-dia-util"
  const [nome, setNome] = useState(inicial.nome)
  const [icon, setIcon] = useState(inicial.icon)
  // Regra avançada abre em "manter" (preserva o n-ésimo dia útil); regra simples
  // abre na própria forma, pronta para trocar entre dia-fixo e último dia útil.
  const [dueRuleKind, setDueRuleKind] = useState(regraAvancada ? "manter" : inicial.dueRuleKind)
  const [dueRuleDay, setDueRuleDay] = useState(inicial.dueRuleDay)

  const erroDe = (campo: string) => getFieldError(state.erros, campo)

  return (
    <form action={formAction} className="flex flex-col gap-5" aria-busy={pending}>
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

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">Ícone</legend>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
          {BILL_ICONS.map((ic) => (
            <label
              key={ic}
              className={`flex aspect-square cursor-pointer items-center justify-center rounded-luc-md border transition-colors focus-within:ring-2 focus-within:ring-luc-accent ${
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
              <BillIcon name={ic} size={18} />
              <span className="sr-only">{ic}</span>
            </label>
          ))}
        </div>
        {erroDe("icon") && <FieldError>{erroDe("icon")}</FieldError>}
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">Vencimento</legend>
        <div className="flex flex-col gap-2">
          {regraAvancada && (
            <label
              className={`flex min-h-[38px] cursor-pointer items-center gap-3 rounded-luc-md border px-3 transition-colors ${
                dueRuleKind === "manter"
                  ? "border-luc-accent bg-luc-accent-12 text-luc-text"
                  : "border-luc-border bg-luc-surface-2 text-luc-text-2 hover:border-luc-border-strong"
              }`}
            >
              <input
                type="radio"
                name="dueRuleKind"
                value="manter"
                checked={dueRuleKind === "manter"}
                onChange={() => setDueRuleKind("manter")}
                className="accent-luc-accent"
              />
              Manter regra atual (n-ésimo dia útil)
            </label>
          )}
          {FORMAS_SIMPLES.map((f) => (
            <label
              key={f.value}
              className={`flex min-h-[38px] cursor-pointer items-center gap-3 rounded-luc-md border px-3 transition-colors ${
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

      <BillLogoPicker billId={billId} icon={icon} logoUrl={logoUrl} />

      <div className="flex items-center justify-end gap-3 border-luc-border border-t pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.replace(closeHref, { scroll: false })}
        >
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  )
}
