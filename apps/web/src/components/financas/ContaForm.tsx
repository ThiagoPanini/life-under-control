"use client"

import {
  CalendarClock,
  ChevronDown,
  Image as ImageIcon,
  type LucideIcon,
  Repeat,
  Tag,
} from "lucide-react"
import { useEffect, useId, useState } from "react"
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
import { type BillFormInicial, INICIAL_PADRAO } from "@/components/financas/bill-form-inicial"
import {
  BILL_ICON_NOMES,
  BILL_ICONS,
  type ErroCampo,
  MESES,
  PERIODICIDADES_PADRAO,
  RECORRENCIA_NOMES,
} from "@/core/domain/bill"

type ContaFormBaseProps = {
  formAction: (formData: FormData) => void
  erros?: ErroCampo[]
  pending?: boolean
  inicial?: BillFormInicial
}

type ContaFormCreateProps = ContaFormBaseProps & {
  mode: "create"
  logoFile: File | null
  onLogoFileChange: (file: File | null) => void
}

type ContaFormEditProps = ContaFormBaseProps & {
  mode: "edit"
  billId: string
  logoUrl: string | null
  onOperacaoEmAndamento?: (emAndamento: boolean) => void
}

export type ContaFormProps = ContaFormCreateProps | ContaFormEditProps

const FORMAS = [
  { value: "dia-fixo", label: "Dia fixo" },
  { value: "n-esimo-dia-util", label: "N-ésimo dia útil" },
  { value: "ultimo-dia-util", label: "Último dia útil" },
]

const selectClass = `${compactInputClass} font-sans text-[14px] font-medium [color-scheme:dark]`
const optionClass = "bg-luc-surface-3 font-sans text-[14px] font-medium text-luc-text"

const ORDEM_CAMPOS = [
  "nome",
  "descricao",
  "intervalMonths",
  "anchorMonth",
  "dueRuleKind",
  "dueRuleDay",
  "dueRuleNth",
  "icon",
]

/** Formulário único de Conta: criação e edição compartilham a mesma tela e os mesmos campos. */
export function ContaForm(props: ContaFormProps) {
  const inicial = props.inicial ?? INICIAL_PADRAO
  const erros = props.erros ?? []
  const [nome, setNome] = useState(inicial.nome)
  const [descricao, setDescricao] = useState(inicial.descricao)
  const [intervalMonths, setIntervalMonths] = useState(inicial.intervalMonths)
  const [anchorMonth, setAnchorMonth] = useState(inicial.anchorMonth)
  const [dueRuleKind, setDueRuleKind] = useState(inicial.dueRuleKind)
  const [dueRuleDay, setDueRuleDay] = useState(inicial.dueRuleDay)
  const [dueRuleNth, setDueRuleNth] = useState(inicial.dueRuleNth)
  const [icon, setIcon] = useState(inicial.icon)
  const [iconesAbertos, setIconesAbertos] = useState(false)
  const formId = useId()
  const iconListId = `${formId}-icon-list`
  const iconNome = BILL_ICON_NOMES[icon as keyof typeof BILL_ICON_NOMES]
  const precisaAncora = Number(intervalMonths) > 1
  const erroDe = (campo: string) => getFieldError(erros, campo)
  const idDe = (campo: string) => `${formId}-${campo}`

  useEffect(() => {
    const primeiro = [...erros].sort(
      (a, b) => ORDEM_CAMPOS.indexOf(a.campo) - ORDEM_CAMPOS.indexOf(b.campo),
    )[0]
    if (!primeiro) return
    const alvo = document.getElementById(`${formId}-${primeiro.campo}`)
    if (!alvo) return
    alvo.focus()
    alvo.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [erros, formId])

  return (
    <form action={props.formAction} className="flex flex-col gap-5" aria-busy={props.pending}>
      <input type="hidden" name="dueMonthOffset" value={inicial.dueMonthOffset} />
      <section className="flex flex-col gap-[13px]">
        <GrupoTitulo
          icon={Tag}
          titulo="Identidade"
          descricao="Nome e contexto para reconhecer a Conta num relance."
        />
        <Field
          label="Nome"
          labelClassName={compactLabelClass}
          htmlFor={idDe("nome")}
          error={erroDe("nome")}
        >
          <input
            id={idDe("nome")}
            name="nome"
            type="text"
            maxLength={80}
            autoComplete="off"
            placeholder="Condomínio, Luz, Internet…"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            className={compactInputClass}
            aria-invalid={Boolean(erroDe("nome"))}
          />
        </Field>
        <Field
          label="Descrição (opcional)"
          labelClassName={compactLabelClass}
          htmlFor={idDe("descricao")}
          error={erroDe("descricao")}
        >
          <textarea
            id={idDe("descricao")}
            name="descricao"
            rows={2}
            maxLength={280}
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            className={`${compactInputClass} resize-none py-2`}
            aria-invalid={Boolean(erroDe("descricao"))}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-[13px] border-luc-border border-t pt-5">
        <GrupoTitulo
          icon={Repeat}
          titulo="Recorrência"
          descricao="Cadência da regra e, quando necessário, seu mês-âncora."
        />
        <Field
          label="Periodicidade"
          labelClassName={compactLabelClass}
          htmlFor={idDe("intervalMonths")}
          error={erroDe("intervalMonths")}
        >
          <select
            id={idDe("intervalMonths")}
            name="intervalMonths"
            value={intervalMonths}
            onChange={(event) => setIntervalMonths(event.target.value)}
            className={selectClass}
            aria-invalid={Boolean(erroDe("intervalMonths"))}
          >
            {PERIODICIDADES_PADRAO.map((months) => (
              <option key={months} value={months} className={optionClass}>
                {RECORRENCIA_NOMES[months]}
              </option>
            ))}
          </select>
        </Field>
        {precisaAncora && (
          <Field
            label="Mês-âncora"
            labelClassName={compactLabelClass}
            htmlFor={idDe("anchorMonth")}
            error={erroDe("anchorMonth")}
          >
            <select
              id={idDe("anchorMonth")}
              name="anchorMonth"
              value={anchorMonth}
              onChange={(event) => setAnchorMonth(event.target.value)}
              className={selectClass}
              aria-invalid={Boolean(erroDe("anchorMonth"))}
            >
              <option value="" disabled className={optionClass}>
                Em que mês cai?
              </option>
              {MESES.map((mes, index) => (
                <option key={mes} value={index + 1} className={optionClass}>
                  {mes}
                </option>
              ))}
            </select>
          </Field>
        )}
      </section>

      <section className="flex flex-col gap-[13px] border-luc-border border-t pt-5">
        <GrupoTitulo
          icon={CalendarClock}
          titulo="Vencimento"
          descricao="Quando o pagamento é esperado; nenhum valor mora na Conta."
        />
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className={`p-0 ${compactLabelClass}`}>Forma</legend>
          <div className="flex flex-col gap-1.5">
            {FORMAS.map((forma, index) => (
              <label
                key={forma.value}
                className={`flex min-h-[38px] cursor-pointer items-center gap-2.5 rounded-[9px] border px-3 font-sans text-[14px] font-medium transition-colors focus-within:ring-2 focus-within:ring-luc-accent ${
                  dueRuleKind === forma.value
                    ? "border-luc-accent/45 bg-luc-accent-06 text-luc-text"
                    : "border-luc-border bg-white/[0.03] text-luc-text-2 hover:border-luc-border-strong"
                }`}
              >
                <input
                  id={index === 0 ? idDe("dueRuleKind") : undefined}
                  type="radio"
                  name="dueRuleKind"
                  value={forma.value}
                  checked={dueRuleKind === forma.value}
                  onChange={() => setDueRuleKind(forma.value)}
                  className="accent-luc-accent"
                />
                {forma.label}
              </label>
            ))}
          </div>
          {erroDe("dueRuleKind") && <FieldError>{erroDe("dueRuleKind")}</FieldError>}
        </fieldset>
        {dueRuleKind === "dia-fixo" && (
          <Field
            label="Dia do mês"
            labelClassName={compactLabelClass}
            htmlFor={idDe("dueRuleDay")}
            error={erroDe("dueRuleDay")}
          >
            <input
              id={idDe("dueRuleDay")}
              name="dueRuleDay"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              value={dueRuleDay}
              onChange={(event) => setDueRuleDay(event.target.value)}
              className={compactInputClass}
              aria-invalid={Boolean(erroDe("dueRuleDay"))}
            />
          </Field>
        )}
        {dueRuleKind === "n-esimo-dia-util" && (
          <Field
            label="Dia útil nº"
            labelClassName={compactLabelClass}
            htmlFor={idDe("dueRuleNth")}
            error={erroDe("dueRuleNth")}
          >
            <input
              id={idDe("dueRuleNth")}
              name="dueRuleNth"
              type="number"
              min={1}
              max={23}
              inputMode="numeric"
              value={dueRuleNth}
              onChange={(event) => setDueRuleNth(event.target.value)}
              className={compactInputClass}
              aria-invalid={Boolean(erroDe("dueRuleNth"))}
            />
          </Field>
        )}
      </section>

      <section className="flex flex-col gap-[13px] border-luc-border border-t pt-5">
        <GrupoTitulo
          icon={ImageIcon}
          titulo="Ícone"
          descricao="Escolha o símbolo de fallback e, se quiser, use um logo."
        />
        <input type="hidden" name="icon" value={icon} />
        <button
          id={idDe("icon")}
          type="button"
          aria-expanded={iconesAbertos}
          aria-controls={iconListId}
          aria-invalid={Boolean(erroDe("icon"))}
          onClick={() => setIconesAbertos((aberto) => !aberto)}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-[9px] border border-luc-border-strong bg-white/[0.03] px-3 text-left text-[12.5px] text-luc-text transition-colors hover:border-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent aria-[invalid=true]:border-luc-warn"
        >
          {icon ? (
            <span className="shrink-0 text-luc-accent-bright">
              <BillIcon name={icon} size={17} />
            </span>
          ) : (
            <span aria-hidden className="h-[17px] w-[17px] rounded-luc-sm bg-luc-surface-2" />
          )}
          <span className="min-w-0 flex-1 truncate">{iconNome ?? "Escolher ícone"}</span>
          <ChevronDown
            aria-hidden
            size={15}
            className={`shrink-0 text-luc-text-3 transition-transform ${iconesAbertos ? "rotate-180" : ""}`}
          />
        </button>
        {iconesAbertos && (
          <fieldset
            id={iconListId}
            aria-label="Opções de ícone"
            className="grid grid-cols-6 gap-1.5 border-0 p-0"
          >
            {BILL_ICONS.map((item) => (
              <label
                key={item}
                title={BILL_ICON_NOMES[item]}
                className={`flex aspect-square min-w-0 cursor-pointer items-center justify-center rounded-[9px] border transition-colors focus-within:ring-2 focus-within:ring-luc-accent ${
                  icon === item
                    ? "border-luc-accent/45 bg-luc-accent-12 text-luc-accent-bright"
                    : "border-luc-border bg-white/[0.03] text-luc-text-2 hover:border-luc-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name={`${formId}-icon-choice`}
                  value={item}
                  checked={icon === item}
                  onChange={() => {
                    setIcon(item)
                    setIconesAbertos(false)
                  }}
                  className="sr-only"
                />
                <BillIcon name={item} size={17} />
                <span className="sr-only">{BILL_ICON_NOMES[item]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {erroDe("icon") && <FieldError>{erroDe("icon")}</FieldError>}
        {props.mode === "create" ? (
          <BillLogoPicker
            mode="deferred"
            icon={icon}
            file={props.logoFile}
            onFileChange={props.onLogoFileChange}
          />
        ) : (
          <BillLogoPicker
            billId={props.billId}
            icon={icon}
            logoUrl={props.logoUrl}
            variant="compacto"
            onOperacaoEmAndamento={props.onOperacaoEmAndamento}
          />
        )}
      </section>

      <div className="border-luc-border border-t pt-5">
        <Button variant="primary" type="submit" disabled={props.pending} className="w-full">
          {props.pending
            ? props.mode === "create"
              ? "Cadastrando…"
              : "Salvando…"
            : props.mode === "create"
              ? "Cadastrar Conta"
              : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}

function GrupoTitulo({
  icon: Icon,
  titulo,
  descricao,
}: {
  icon: LucideIcon
  titulo: string
  descricao: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-luc-accent-12 text-luc-accent-bright">
        <Icon aria-hidden size={15} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-bold text-luc-text">{titulo}</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-luc-muted">{descricao}</p>
      </div>
    </div>
  )
}
