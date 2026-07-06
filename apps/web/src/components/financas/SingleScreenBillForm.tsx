"use client"

import { ChevronDown } from "lucide-react"
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
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
 * Formulário de Conta em **tela única** (borda fina — Seam 3): as três seções —
 * Identidade, Recorrência e Vencimento — empilhadas numa coluna só, tudo visível
 * num scroll. Aposenta o wizard de 4 passos (`BillForm`) no fluxo de **criação**;
 * o wizard segue vivo só na edição até a S7. Coleta nome, descrição, ícone,
 * Recorrência e a regra de vencimento — nunca um valor (invariante #5) — e submete
 * ao server action. A validação-fonte mora no núcleo (`validarDadosBill`, via
 * `createBill`); aqui só há lógica de borda: campos condicionais, o dropdown de
 * ícone contido e o foco no 1º campo inválido após um submit com erro.
 *
 * Todos os campos são controlados de propósito: o valor digitado sobrevive a
 * alternar a forma de vencimento e ao auto-reset do `<form action={fn}>` do React
 * 19 quando o action devolve erro em vez de redirecionar.
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

export function SingleScreenBillForm({
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

  // Após um submit inválido, foca e rola até o primeiro campo com erro (na ordem
  // canônica). Substitui o "salto de passo" do wizard — aqui não há passos.
  useEffect(() => {
    if (erros.length === 0) return
    const primeiro = [...erros].sort(
      (a, b) => ORDEM_CAMPOS.indexOf(a.campo) - ORDEM_CAMPOS.indexOf(b.campo),
    )[0]
    const alvo = document.getElementById(`${formId}-${primeiro.campo}`)
    if (!alvo) return
    alvo.focus()
    alvo.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [erros, formId])

  return (
    <form action={formAction} className="flex flex-col gap-7" aria-busy={pending}>
      {/* Identidade */}
      <Secao titulo="Identidade" descricao="Nome, símbolo e contexto para encontrá-la num relance.">
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

        <IconDropdown id={idDe("icon")} value={icon} onChange={setIcon} error={erroDe("icon")} />
      </Secao>

      {/* Recorrência */}
      <Secao titulo="Recorrência" descricao="A cadência e, quando maior que mensal, o mês-âncora.">
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
      </Secao>

      {/* Vencimento */}
      <Secao
        titulo="Vencimento"
        descricao="Quando se espera o pagamento — a Conta projeta, nunca guarda um valor."
      >
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-[11.5px] font-semibold text-luc-text-3">
            Forma de vencimento
          </legend>
          <div className="flex flex-col gap-2">
            {FORMAS.map((f, i) => (
              <label
                key={f.value}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-luc-md border px-3 transition-colors ${
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
      </Secao>

      <div className="border-luc-border border-t pt-5">
        <Button variant="primary" type="submit" disabled={pending} className="w-full">
          {pending ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** Seção da tela única: título visível + subtítulo, e os campos empilhados. */
function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-[13.5px] font-bold text-luc-text">{titulo}</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-luc-muted">{descricao}</p>
      </div>
      {children}
    </section>
  )
}

/** Altura estimada do painel — o bastante pra decidir abrir pra baixo ou pra cima. */
const ALTURA_ESTIMADA_DROPDOWN = 300

/**
 * Dropdown **contido** de ícone: substitui a grade de 17 ícones "jogada na tela"
 * por um seletor único. Cada opção traz o glifo + o rótulo pt-BR do catálogo
 * (`BILL_ICON_NOMES`); o valor persistido é o id Lucide, carregado por input
 * hidden `name="icon"`. Ancoragem por `position: fixed` medido do gatilho (sem
 * portal), fechando em scroll/resize/clique-fora/Escape — mesma mecânica do
 * `DatePicker` (#88), para o painel não ser cortado pelo overflow do modal.
 */
function IconDropdown({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: string
  onChange: (icon: string) => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const nomeAtual = value ? BILL_ICON_NOMES[value as keyof typeof BILL_ICON_NOMES] : null

  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cabeAbaixo = rect.bottom + 6 + ALTURA_ESTIMADA_DROPDOWN <= window.innerHeight
    const top = cabeAbaixo ? rect.bottom + 6 : Math.max(8, rect.top - ALTURA_ESTIMADA_DROPDOWN - 6)
    setPosition({ top, left: rect.left, width: rect.width })
  }, [open])

  useEffect(() => {
    if (!open) return
    function fecharNoEsc(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      // Capture + stopPropagation: intercepta antes do Escape do Modal ancestral,
      // que senão fecharia o modal inteiro e descartaria o formulário.
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    function fecharForaDoClique(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function fecharAoRolarOuRedimensionar() {
      setOpen(false)
    }
    document.addEventListener("keydown", fecharNoEsc, true)
    document.addEventListener("mousedown", fecharForaDoClique)
    document.addEventListener("scroll", fecharAoRolarOuRedimensionar, true)
    window.addEventListener("resize", fecharAoRolarOuRedimensionar)
    return () => {
      document.removeEventListener("keydown", fecharNoEsc, true)
      document.removeEventListener("mousedown", fecharForaDoClique)
      document.removeEventListener("scroll", fecharAoRolarOuRedimensionar, true)
      window.removeEventListener("resize", fecharAoRolarOuRedimensionar)
    }
  }, [open])

  // Ao abrir, o foco assenta na opção selecionada (ou na 1ª) — padrão listbox.
  useEffect(() => {
    if (!open) return
    const sel = BILL_ICONS.indexOf(value as (typeof BILL_ICONS)[number])
    setActiveIndex(sel >= 0 ? sel : 0)
  }, [open, value])

  // Roving tabindex: move o foco real para a opção ativa a cada navegação. Depende
  // de `position` porque o listbox só monta depois que a ancoragem é medida — sem
  // isso, o foco de abertura correria antes de o painel existir no DOM.
  useEffect(() => {
    if (!open || !position) return
    listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${activeIndex}"]`)?.focus()
  }, [open, activeIndex, position])

  // Setas/Home/End percorrem as opções (o listbox promete essa navegação); Enter/
  // Espaço selecionam via o onClick do <button>, e Escape fecha no listener acima.
  function navegar(event: ReactKeyboardEvent<HTMLDivElement>) {
    const n = BILL_ICONS.length
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % n)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + n) % n)
    } else if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(n - 1)
    }
  }

  function selecionar(ic: string) {
    onChange(ic)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-[11.5px] font-semibold text-luc-text-3">
        Ícone
      </span>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} flex items-center gap-2.5 text-left`}
      >
        {value ? (
          <BillIcon name={value} size={18} />
        ) : (
          <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-luc-border border-dashed" />
        )}
        <span id={`${id}-value`} className={nomeAtual ? "text-luc-text" : "text-luc-faint"}>
          {nomeAtual ?? "Escolher ícone"}
        </span>
        <ChevronDown aria-hidden size={16} className="ml-auto shrink-0 text-luc-text-3" />
      </button>
      <input type="hidden" name="icon" value={value} />
      {open && position && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Ícones"
          onKeyDown={navegar}
          style={{ top: position.top, left: position.left, width: position.width }}
          className="fixed z-[80] max-h-[300px] overflow-y-auto overscroll-contain rounded-luc-lg border border-luc-border-strong bg-luc-surface-3 p-1 shadow-[0_24px_60px_rgba(0,0,0,.5)]"
        >
          {BILL_ICONS.map((ic, i) => (
            <button
              key={ic}
              type="button"
              role="option"
              data-index={i}
              tabIndex={i === activeIndex ? 0 : -1}
              aria-selected={ic === value}
              onClick={() => selecionar(ic)}
              className={`flex w-full items-center gap-2.5 rounded-luc-md px-2.5 py-2 text-left text-[13px] transition-colors ${
                ic === value
                  ? "bg-luc-accent-12 text-luc-accent-bright"
                  : "text-luc-text-2 hover:bg-luc-surface-2"
              }`}
            >
              <BillIcon name={ic} size={18} />
              <span>{BILL_ICON_NOMES[ic]}</span>
            </button>
          ))}
        </div>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}
