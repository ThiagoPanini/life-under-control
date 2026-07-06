"use client"

import { CalendarClock, type LucideIcon, Repeat, Tag } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Button } from "@/components/ds/Button"
import { Field, FieldError, getFieldError, inputClass } from "@/components/ds/FormField"
import { BillIcon } from "@/components/financas/BillIcon"
import { type BillFormInicial, INICIAL_PADRAO } from "@/components/financas/bill-form-inicial"
import {
  BILL_ICON_NOMES,
  BILL_ICONS,
  type ErroCampo,
  MESES,
  PERIODICIDADES_PADRAO,
  RECORRENCIA_NOMES,
} from "@/core/domain/bill"

/**
 * Formulário de cadastro de Conta em **duas etapas enxutas** (borda fina — Seam 3):
 * (1) Identidade e (2) Recorrência + Vencimento. Espelha o sistema visual do wizard
 * de edição (`BillForm`) — indicador de passos, grade de ícones só-glifo e rodapé de
 * navegação — porque criação e edição serão reconciliados; muda só a granularidade
 * (2 etapas, sem passo de Resumo). Coleta nome, descrição, ícone, Recorrência e a
 * regra de vencimento — nunca um valor (invariante #5). A validação-fonte mora no
 * núcleo (`validarDadosBill`, via `createBill`); aqui só há lógica de borda: as
 * etapas, os campos condicionais e o salto para o 1º campo inválido após um submit.
 *
 * Todos os campos são controlados de propósito: o valor digitado sobrevive a trocar
 * de etapa, alternar a forma de vencimento e ao auto-reset do `<form action={fn}>`
 * do React 19 quando o action devolve erro em vez de redirecionar.
 *
 * Apresentacional e injetável: recebe `formAction`/`erros`/`pending`, então o teste
 * o exercita sem o server action real.
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

const PASSOS = ["Identidade", "Recorrência + Vencimento"]

/** Em que etapa (0–1) cada campo mora — para saltar à etapa do 1º erro ao submeter. */
const PASSO_DO_CAMPO: Record<string, number> = {
  nome: 0,
  descricao: 0,
  icon: 0,
  intervalMonths: 1,
  anchorMonth: 1,
  dueRuleKind: 1,
  dueRuleDay: 1,
  dueRuleNth: 1,
  dueMonthOffset: 1,
}

/** Ordem canônica dos campos — decide qual erro é o "primeiro" a focar/rolar. */
const ORDEM_CAMPOS = [
  "nome",
  "descricao",
  "icon",
  "intervalMonths",
  "anchorMonth",
  "dueRuleKind",
  "dueRuleDay",
  "dueRuleNth",
  "dueMonthOffset",
]

export function NovaContaForm({
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
  const erroDe = (campo: string) => getFieldError(erros, campo)
  const idDe = (campo: string) => `${formId}-${campo}`

  // Após um submit inválido, salta para a etapa do primeiro erro (na ordem canônica).
  useEffect(() => {
    if (erros.length === 0) return
    const primeiro = [...erros].sort(
      (a, b) => ORDEM_CAMPOS.indexOf(a.campo) - ORDEM_CAMPOS.indexOf(b.campo),
    )[0]
    setPasso(PASSO_DO_CAMPO[primeiro.campo] ?? 0)
  }, [erros])

  // Assim que a etapa do erro fica visível, foca e rola o 1º campo inválido dela — o
  // efeito depende de `passo` para rodar só depois que o `hidden` da etapa saiu.
  useEffect(() => {
    if (erros.length === 0) return
    const naEtapa = [...erros]
      .filter((e) => (PASSO_DO_CAMPO[e.campo] ?? 0) === passo)
      .sort((a, b) => ORDEM_CAMPOS.indexOf(a.campo) - ORDEM_CAMPOS.indexOf(b.campo))[0]
    if (!naEtapa) return
    const alvo = document.getElementById(`${formId}-${naEtapa.campo}`)
    if (!alvo) return
    alvo.focus()
    alvo.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [erros, passo, formId])

  return (
    <form action={formAction} className="flex flex-col gap-6" aria-busy={pending}>
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

      {/* Etapa 1 — Identidade */}
      <fieldset hidden={passo !== 0} className="flex flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Identidade</legend>
        <GrupoTitulo
          icon={Tag}
          titulo="Identidade"
          descricao="Nome, símbolo e contexto para encontrá-la num relance."
        />

        <Field label="Nome" htmlFor={idDe("nome")} error={erroDe("nome")}>
          <input
            id={idDe("nome")}
            name="nome"
            type="text"
            maxLength={80}
            autoComplete="off"
            placeholder="Condomínio, Luz, Internet…"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erroDe("nome"))}
            aria-describedby={erroDe("nome") ? `${idDe("nome")}-error` : undefined}
          />
        </Field>

        <Field label="Descrição (opcional)" htmlFor={idDe("descricao")} error={erroDe("descricao")}>
          <textarea
            id={idDe("descricao")}
            name="descricao"
            rows={2}
            maxLength={280}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className={`${inputClass} resize-none`}
            aria-invalid={Boolean(erroDe("descricao"))}
            aria-describedby={erroDe("descricao") ? `${idDe("descricao")}-error` : undefined}
          />
        </Field>

        <GradeDeIcones
          idPrimeiro={idDe("icon")}
          value={icon}
          onChange={setIcon}
          error={erroDe("icon")}
        />
      </fieldset>

      {/* Etapa 2 — Recorrência + Vencimento */}
      <fieldset hidden={passo !== 1} className="flex flex-col gap-6 border-0 p-0">
        <legend className="sr-only">Recorrência e Vencimento</legend>

        <div className="flex flex-col gap-5">
          <GrupoTitulo
            icon={Repeat}
            titulo="Recorrência"
            descricao="A cadência e, quando maior que mensal, o mês-âncora."
          />
          <Field
            label="Periodicidade"
            htmlFor={idDe("intervalMonths")}
            error={erroDe("intervalMonths")}
          >
            <select
              id={idDe("intervalMonths")}
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
            <Field label="Mês-âncora" htmlFor={idDe("anchorMonth")} error={erroDe("anchorMonth")}>
              <select
                id={idDe("anchorMonth")}
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
        </div>

        <div className="flex flex-col gap-5 border-luc-border border-t pt-6">
          <GrupoTitulo
            icon={CalendarClock}
            titulo="Vencimento"
            descricao="Quando se espera o pagamento — a Conta projeta, nunca guarda um valor."
          />

          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">
              Forma de vencimento
            </legend>
            <div className="flex flex-col gap-2">
              {FORMAS.map((f, i) => (
                <label
                  key={f.value}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-luc-md border px-3 text-[13.5px] transition-colors ${
                    dueRuleKind === f.value
                      ? "border-luc-accent bg-luc-accent-12 text-luc-text"
                      : "border-luc-border bg-luc-surface-2 text-luc-text-2 hover:border-luc-border-strong"
                  }`}
                >
                  <input
                    // O primeiro rádio carrega o id do campo, para o foco no 1º inválido.
                    id={i === 0 ? idDe("dueRuleKind") : undefined}
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
            <Field label="Dia do mês" htmlFor={idDe("dueRuleDay")} error={erroDe("dueRuleDay")}>
              <input
                id={idDe("dueRuleDay")}
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
            <Field label="Dia útil nº" htmlFor={idDe("dueRuleNth")} error={erroDe("dueRuleNth")}>
              <input
                id={idDe("dueRuleNth")}
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
            htmlFor={idDe("dueMonthOffset")}
            error={erroDe("dueMonthOffset")}
          >
            <select
              id={idDe("dueMonthOffset")}
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
        </div>
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

/** Cabeçalho de grupo de configuração: chip de ícone em accent + título e subtítulo. */
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
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
        <Icon aria-hidden size={15} strokeWidth={1.8} />
      </span>
      <div>
        <h2 className="text-[13.5px] font-bold text-luc-text">{titulo}</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-luc-muted">{descricao}</p>
      </div>
    </div>
  )
}

/**
 * Grade de ícones **só-glifo** (item do redesign): a pessoa está cadastrando uma
 * Conta e escolhe o símbolo pelo desenho, não por um rótulo ao lado. Mesmo padrão
 * do wizard de edição (`BillForm`) — rádios `name="icon"` com o glifo visível e o
 * nome pt-BR só para leitor de tela, mantendo a escolha acessível sem poluir a UI.
 */
function GradeDeIcones({
  idPrimeiro,
  value,
  onChange,
  error,
}: {
  idPrimeiro: string
  value: string
  onChange: (icon: string) => void
  error?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">Ícone</legend>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        {BILL_ICONS.map((ic, i) => (
          <label
            key={ic}
            className={`flex aspect-square cursor-pointer items-center justify-center rounded-luc-md border transition-colors ${
              value === ic
                ? "border-luc-accent bg-luc-accent-12 text-luc-accent-bright"
                : "border-luc-border bg-luc-surface-2 text-luc-text-2 hover:border-luc-border-strong hover:text-luc-text"
            }`}
          >
            <input
              // O primeiro rádio carrega o id do campo, para o foco no 1º inválido.
              id={i === 0 ? idPrimeiro : undefined}
              type="radio"
              name="icon"
              value={ic}
              checked={value === ic}
              onChange={() => onChange(ic)}
              className="sr-only"
            />
            <BillIcon name={ic} size={20} />
            <span className="sr-only">{BILL_ICON_NOMES[ic]}</span>
          </label>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </fieldset>
  )
}
