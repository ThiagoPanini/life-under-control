"use client"

import { Calendar } from "lucide-react"
import { useActionState, useId, useState } from "react"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import {
  compactInputClass,
  compactLabelClass,
  Field,
  FieldError,
  getFieldError,
} from "@/components/ds/FormField"
import { BillIcon } from "@/components/financas/BillIcon"
import { BillLogoPicker } from "@/components/financas/BillLogoPicker"
import { BILL_ICON_NOMES, BILL_ICONS, type DueRuleKind } from "@/core/domain/bill"

/**
 * Os campos-string que a edição rápida pré-preenche: nome, ícone e a regra de
 * vencimento atual (para escolher o segmento certo e prover o dia quando dia-fixo).
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

/** Segmento do seletor de vencimento (Final): 38px, raio 9, selecionado veste accent 45%. */
function segmentoClass(selecionado: boolean): string {
  return `flex min-h-[38px] flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-[9px] border text-[12.5px] font-semibold text-luc-text transition-colors focus-within:ring-2 focus-within:ring-luc-accent ${
    selecionado
      ? "border-luc-accent/45 bg-luc-accent-06"
      : "border-luc-border bg-transparent hover:border-luc-border-strong"
  }`
}

/**
 * Formulário compacto da edição rápida de uma Conta (o lápis do card), na
 * composição exata do protótipo Final: Nome → Vencimento (segmentado + "todo
 * dia N" inline) → Ícone · ou um logo (grade 36px, sempre visível — o ícone é o
 * fallback persistido) → nota de domínio → um único "Salvar alterações" de
 * largura cheia (o X do modal
 * é a saída). Coleta só a allowlist — as regras avançadas (descrição,
 * periodicidade, âncora, n-ésimo dia útil, deslocamento) **não aparecem** aqui:
 * seguem na edição completa e são preservadas byte a byte pelo `quickEditBill`.
 * Quando a regra atual é avançada, o segmento "Manter regra atual" vem
 * selecionado e submete sem tocar o vencimento.
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
  onOperacaoEmAndamento,
}: {
  billId: string
  logoUrl: string | null
  inicial: QuickBillInicial
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  /** Sobe o enviando/removendo do logo pro modal travar o descarte silencioso (#100, AC13). */
  onOperacaoEmAndamento?: (emAndamento: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
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
    <form action={formAction} className="flex flex-col gap-[13px]" aria-busy={pending}>
      <Field
        label="Nome da Conta"
        labelClassName={compactLabelClass}
        htmlFor={`${formId}-nome`}
        error={erroDe("nome")}
      >
        <input
          id={`${formId}-nome`}
          name="nome"
          type="text"
          maxLength={80}
          autoComplete="off"
          placeholder="Condomínio, Luz, Internet…"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={compactInputClass}
          aria-invalid={Boolean(erroDe("nome"))}
          aria-describedby={erroDe("nome") ? `${formId}-nome-error` : undefined}
        />
      </Field>

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className={`p-0 ${compactLabelClass}`}>Vencimento</legend>
        {regraAvancada && (
          <label className={segmentoClass(dueRuleKind === "manter")}>
            <input
              type="radio"
              name="dueRuleKind"
              value="manter"
              checked={dueRuleKind === "manter"}
              onChange={() => setDueRuleKind("manter")}
              className="sr-only"
            />
            Manter regra atual (n-ésimo dia útil)
          </label>
        )}
        <div className="flex gap-2">
          {FORMAS_SIMPLES.map((f) => (
            <label key={f.value} className={segmentoClass(dueRuleKind === f.value)}>
              <input
                type="radio"
                name="dueRuleKind"
                value={f.value}
                checked={dueRuleKind === f.value}
                onChange={() => setDueRuleKind(f.value)}
                className="sr-only"
              />
              {f.label}
            </label>
          ))}
        </div>
        {dueRuleKind === "dia-fixo" && (
          <div
            className={`mt-0.5 flex min-h-[38px] items-center gap-2 rounded-[9px] border bg-white/[0.03] px-3 transition-[border-color,box-shadow] focus-within:border-luc-accent focus-within:ring-2 focus-within:ring-luc-accent ${
              erroDe("dueRuleDay") ? "border-luc-warn" : "border-luc-border-strong"
            }`}
          >
            <Calendar aria-hidden size={14} className="shrink-0 text-luc-muted" />
            <label
              htmlFor={`${formId}-dia`}
              className="shrink-0 whitespace-nowrap text-[12.5px] text-luc-text-2"
            >
              todo dia
            </label>
            <input
              id={`${formId}-dia`}
              name="dueRuleDay"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              value={dueRuleDay}
              onChange={(e) => setDueRuleDay(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent font-mono text-[14px] text-luc-text outline-none"
              aria-invalid={Boolean(erroDe("dueRuleDay"))}
            />
          </div>
        )}
        {erroDe("dueRuleKind") && <FieldError>{erroDe("dueRuleKind")}</FieldError>}
        {erroDe("dueRuleDay") && <FieldError>{erroDe("dueRuleDay")}</FieldError>}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className={`p-0 ${compactLabelClass}`}>
          Ícone{" "}
          <span className="font-semibold normal-case tracking-normal text-luc-faint">
            · ou um logo
          </span>
        </legend>
        {/* O protótipo esconde a grade quando há logo, mas o ícone é o fallback
            persistido (tiles sem logo, estados degradados) — o mock não dita
            comportamento: a grade fica visível pra trocar o fallback sem antes
            destruir o logo (a remoção é imediata e sem desfazer). */}
        <div className="flex flex-wrap gap-1.5">
          {BILL_ICONS.map((ic) => (
            <label
              key={ic}
              title={BILL_ICON_NOMES[ic]}
              className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border transition-colors focus-within:ring-2 focus-within:ring-luc-accent ${
                icon === ic
                  ? "border-luc-accent/45 bg-luc-accent-12 text-luc-accent-bright"
                  : "border-luc-border bg-white/[0.03] text-luc-text-2 hover:border-luc-border-strong"
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
              <BillIcon name={ic} size={16} />
              <span className="sr-only">{BILL_ICON_NOMES[ic]}</span>
            </label>
          ))}
        </div>
        {erroDe("icon") && <FieldError>{erroDe("icon")}</FieldError>}
        <BillLogoPicker
          billId={billId}
          icon={icon}
          logoUrl={logoUrl}
          variant="compacto"
          onOperacaoEmAndamento={onOperacaoEmAndamento}
        />
        <span className="text-[10.5px] text-luc-faint">
          A Conta guarda o quando, nunca o quanto — o valor nasce em cada Lançamento.
        </span>
      </fieldset>

      <div className="mt-[3px]">
        <Button variant="primary" type="submit" disabled={pending} className="min-h-10 w-full">
          {pending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}
