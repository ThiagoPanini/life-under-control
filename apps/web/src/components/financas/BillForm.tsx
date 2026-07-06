"use client"

import { Check, ImagePlus, Pencil } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Button } from "@/components/ds/Button"
import { Field, FieldError, getFieldError, inputClass } from "@/components/ds/FormField"
import { BillIcon } from "@/components/financas/BillIcon"
import { type BillFormInicial, INICIAL_PADRAO } from "@/components/financas/bill-form-inicial"
import {
  BILL_ICONS,
  descreverRecorrencia,
  descreverVencimento,
  type ErroCampo,
  MESES,
  PERIODICIDADES_PADRAO,
  RECORRENCIA_NOMES,
  validarDadosBill,
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

const PASSOS = ["Identidade", "Recorrência", "Vencimento", "Resumo"]
const PASSO_COPY = [
  ["Como reconhecer esta Conta?", "Nome, símbolo e contexto para encontrá-la num relance."],
  ["Com que frequência ela acontece?", "Defina a cadência e, quando necessário, o mês-âncora."],
  ["Quando se espera o pagamento?", "A Conta projeta o vencimento — ela nunca guarda um valor."],
  ["Tudo certo para criar a Conta?", "Revise a regra inteira. Você pode voltar a qualquer trecho."],
] as const

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
  logoFile,
  onLogoFileChange,
  mode = "create",
}: {
  formAction: (formData: FormData) => void
  erros?: ErroCampo[]
  pending?: boolean
  inicial?: BillFormInicial
  submitLabel?: string
  submittingLabel?: string
  logoFile?: File | null
  onLogoFileChange?: (file: File | null) => void
  mode?: "create" | "edit"
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
  const [logoFileInterno, setLogoFileInterno] = useState<File | null>(null)
  const formId = useId()

  const precisaAncora = Number(intervalMonths) > 1

  // Após um submit inválido, salta para o passo do primeiro erro.
  useEffect(() => {
    if (erros.length === 0) return
    const passos = erros.map((e) => PASSO_DO_CAMPO[e.campo] ?? 0)
    setPasso(Math.min(...passos))
  }, [erros])

  const erroDe = (campo: string) => getFieldError(erros, campo)
  const logoSelecionado = logoFile === undefined ? logoFileInterno : logoFile
  const permiteSelecionarLogo = logoFile !== undefined || onLogoFileChange !== undefined
  const passoCopy =
    passo === 3 && mode === "edit"
      ? ([
          "Tudo certo para salvar?",
          "Revise a regra inteira antes de aplicar as alterações.",
        ] as const)
      : PASSO_COPY[passo]
  const resumo = validarDadosBill({
    nome,
    descricao,
    icon,
    intervalMonths: Number(intervalMonths),
    anchorMonth: anchorMonth ? Number(anchorMonth) : null,
    dueRuleKind,
    dueRuleDay: dueRuleDay ? Number(dueRuleDay) : null,
    dueRuleNth: dueRuleNth ? Number(dueRuleNth) : null,
    dueMonthOffset: dueMonthOffset ? Number(dueMonthOffset) : 0,
    // A primeira Competência não é campo do wizard — a borda a injeta (Competência
    // corrente ao criar; preservada ao editar). Aqui o Resumo só valida/descreve a
    // *regra*, então um valor válido de fachada basta para o preview passar.
    primeiraCompetencia: "2000-01",
  })

  function selecionarLogo(file: File | null) {
    setLogoFileInterno(file)
    onLogoFileChange?.(file)
  }

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

      <div className="-mt-3">
        <p className="text-[15px] font-bold text-luc-text">{passoCopy[0]}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-luc-muted">{passoCopy[1]}</p>
        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-luc-faint">
          passo {passo + 1} de {PASSOS.length} ·{" "}
          {PASSOS.length - passo - 1 === 0
            ? "última etapa"
            : `${PASSOS.length - passo - 1} restantes`}
        </p>
      </div>

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

        {permiteSelecionarLogo && (
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">
              Logo <span className="font-normal text-luc-faint">(opcional)</span>
            </legend>
            <label className="group flex cursor-pointer items-center gap-3 rounded-luc-md border border-luc-border border-dashed bg-luc-surface-2 px-4 py-3 transition-colors hover:border-luc-border-strong focus-within:ring-2 focus-within:ring-luc-accent">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
                <ImagePlus aria-hidden size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-luc-text-2">
                  {logoSelecionado?.name ?? "Escolher uma imagem"}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-luc-muted">
                  {logoSelecionado
                    ? "O envio acontece depois da criação."
                    : "Ícone continua como alternativa."}
                </span>
              </span>
              {logoSelecionado && (
                <Check aria-label="Logo selecionado" size={16} className="text-luc-success" />
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => selecionarLogo(event.target.files?.[0] ?? null)}
              />
            </label>
            {logoSelecionado && (
              <button
                type="button"
                onClick={() => selecionarLogo(null)}
                className="self-start text-[10.5px] text-luc-text-3 hover:text-luc-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
              >
                Remover logo selecionado
              </button>
            )}
          </fieldset>
        )}
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

      {/* Passo 4 — Resumo */}
      <fieldset hidden={passo !== 3} className="flex flex-col gap-3 border-0 p-0">
        <legend className="sr-only">Resumo</legend>
        <ResumoTrecho titulo="Identidade" onEditar={() => setPasso(0)}>
          <strong className="text-[13.5px] text-luc-text">
            {nome.trim() || "Nome não informado"}
          </strong>
          <span className="text-[11px] text-luc-muted">
            {descricao.trim() || "Sem descrição"} ·{" "}
            {permiteSelecionarLogo
              ? logoSelecionado
                ? "logo selecionado"
                : "somente ícone"
              : "ícone da Conta"}
          </span>
        </ResumoTrecho>
        <ResumoTrecho titulo="Recorrência" onEditar={() => setPasso(1)}>
          <strong className="text-[13.5px] text-luc-text">
            {resumo.ok ? descreverRecorrencia(resumo.value.recurrence) : "Revise a Recorrência"}
          </strong>
          <span className="text-[11px] text-luc-muted">
            A regra define quando a ocorrência volta.
          </span>
        </ResumoTrecho>
        <ResumoTrecho titulo="Vencimento" onEditar={() => setPasso(2)}>
          <strong className="text-[13.5px] text-luc-text">
            {resumo.ok
              ? descreverVencimento(resumo.value.dueRule, resumo.value.dueMonthOffset)
              : "Revise o vencimento"}
          </strong>
          <span className="text-[11px] text-luc-muted">Nenhum valor será guardado na Conta.</span>
        </ResumoTrecho>
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
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-luc-md border px-3 text-[13.5px] transition-colors ${
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

function ResumoTrecho({
  titulo,
  onEditar,
  children,
}: {
  titulo: string
  onEditar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-luc-md border border-luc-border bg-luc-surface-2 p-4">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-luc-faint">
          {titulo}
        </span>
        <div className="mt-1 flex flex-col gap-0.5">{children}</div>
      </div>
      <button
        type="button"
        onClick={onEditar}
        className="flex h-8 items-center gap-1 rounded-luc-sm px-2 text-[10.5px] text-luc-accent transition-colors hover:bg-luc-accent-06 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
      >
        <Pencil aria-hidden size={12} /> Editar
      </button>
    </div>
  )
}
