"use client"

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { systemClock } from "@/adapters/clock/system-clock"
import { compactInputClass, inputClass } from "@/components/ds/FormField"
import { descreverMesPorExtenso, formatarDataBr } from "@/core/domain/bill"

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
/** Altura aproximada do painel (cabeçalho + semana + 6 linhas + "Hoje") — o
 *  bastante pra decidir se abre pra baixo ou vira pra cima perto do rodapé. */
const ALTURA_ESTIMADA_POPOVER = 320

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

type Cursor = { year: number; month: number; focoIso: string }

function cursorDe(iso: string): Cursor {
  const [ano, mes] = iso.split("-").map(Number)
  return { year: ano, month: mes - 1, focoIso: iso }
}

function tituloMes(cursor: Cursor): string {
  const desc = descreverMesPorExtenso(`${cursor.year}-${pad(cursor.month + 1)}`)
  return desc.charAt(0).toUpperCase() + desc.slice(1)
}

/** Dias do mês em grade (com folgas antes do 1º dia da semana). `null` = folga. */
function celulasDoMes(cursor: Cursor): Array<{ dia: number; iso: string } | null> {
  const primeiroDiaSemana = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay()
  const totalDias = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate()
  const celulas: Array<{ dia: number; iso: string } | null> = Array(primeiroDiaSemana).fill(null)
  for (let dia = 1; dia <= totalDias; dia++) {
    celulas.push({ dia, iso: `${cursor.year}-${pad(cursor.month + 1)}-${pad(dia)}` })
  }
  return celulas
}

/** Muda de mês mantendo um dia focável na grade nova (clampa no último dia se o mês for mais curto). */
function cursorNoMes(cursor: Cursor, deltaMeses: number): Cursor {
  let { year, month } = cursor
  month += deltaMeses
  if (month < 0) {
    month = 11
    year -= 1
  } else if (month > 11) {
    month = 0
    year += 1
  }
  const diaAtual = Number(cursor.focoIso.split("-")[2])
  const totalDias = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const dia = Math.min(diaAtual, totalDias)
  return { year, month, focoIso: `${year}-${pad(month + 1)}-${pad(dia)}` }
}

/**
 * Date-picker sob medida (issue #88): substitui o `<input type="date">` nativo
 * (popup do SO) por um popover próprio, consistente com os tokens do DS. O
 * contrato de dados não muda — segue emitindo `name`/valor em ISO civil
 * (`YYYY-MM-DD`) via input hidden, como o form já espera (CONTEXT.md #3).
 *
 * Ancoragem por `position: fixed` medido do gatilho (sem lib, sem portal) —
 * mesmo padrão do `AreaFlyoutTrigger` (`AppShell.tsx`), incluindo fechar em
 * scroll/resize (o popover não se realinha, então some em vez de descolar do
 * campo). Escape usa capture + `stopPropagation`: o modal "Registrar
 * pagamento" (`ds/Modal.tsx`) tem seu próprio Escape no document, e sem isso
 * um Escape pro calendário também fecharia o modal e descartaria o formulário.
 */
export function DatePicker({
  id,
  name,
  value,
  onChange,
  invalid = false,
  describedBy,
  compact = false,
  hoje = systemClock().hoje(),
}: {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  describedBy?: string
  /** Veste compacta dos modais (Final): caixa 38px, raio 9, borda strong, fundo translúcido. */
  compact?: boolean
  hoje?: string
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const focoRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cabeAbaixo = rect.bottom + 6 + ALTURA_ESTIMADA_POPOVER <= window.innerHeight
    const top = cabeAbaixo ? rect.bottom + 6 : Math.max(8, rect.top - ALTURA_ESTIMADA_POPOVER - 6)
    setPosition({ top, left: rect.left })
  }, [open])

  useEffect(() => {
    if (!open) return
    setCursor(cursorDe(value || hoje))
  }, [open, value, hoje])

  useEffect(() => {
    if (!open || !cursor) return
    focoRef.current?.focus()
  }, [open, cursor])

  useEffect(() => {
    if (!open) return
    function fecharNoEsc(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      // Capture + stopPropagation: intercepta antes do Escape do Modal
      // ancestral (document, bubble) rodar e navegar pra fora do formulário.
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

  function selecionar(iso: string) {
    onChange(iso)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function fecharSeFocoSaiu() {
    // setTimeout: no instante do blur o foco ainda não assentou no próximo
    // elemento — reavalia depois, como o AreaFlyoutTrigger (AppShell.tsx).
    window.setTimeout(() => {
      if (!wrapperRef.current?.contains(document.activeElement)) setOpen(false)
    }, 0)
  }

  function mesAnterior() {
    setCursor((c) => (c ? cursorNoMes(c, -1) : c))
  }

  function proximoMes() {
    setCursor((c) => (c ? cursorNoMes(c, 1) : c))
  }

  /** Só reage a setas originadas na grade de dias — nos botões de navegação/"Hoje" não desvia o foco. */
  function moverFoco(event: KeyboardEvent<HTMLDivElement>) {
    const alvo = event.target as HTMLElement
    if (alvo.dataset.diaCelula === undefined) return
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    const delta = deltas[event.key]
    if (delta === undefined || !cursor) return
    event.preventDefault()
    setCursor(cursorDe(somarDias(cursor.focoIso, delta)))
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: só detecta foco saindo do wrapper (gatilho/popover já carregam os papéis interativos); role aqui força <fieldset>, semântica errada.
    <div ref={wrapperRef} className="relative" onBlur={fecharSeFocoSaiu}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={`${compact ? compactInputClass : inputClass} flex items-center gap-2 font-mono`}
      >
        <Calendar
          aria-hidden
          size={compact ? 14 : 16}
          className={`shrink-0 ${compact ? "text-luc-muted" : "text-luc-text-3"}`}
        />
        <span className={value ? "" : "text-luc-faint"}>
          {value ? formatarDataBr(value) : "dd/mm/aaaa"}
        </span>
      </button>
      <input type="hidden" name={name} value={value} />
      {open && position && cursor && (
        <div
          role="dialog"
          aria-label="Escolher data"
          style={{ top: position.top, left: position.left }}
          className="fixed z-[80] w-[272px] rounded-luc-lg border border-luc-border-strong bg-luc-surface-3 p-3 shadow-[0_24px_60px_rgba(0,0,0,.5)]"
          onKeyDown={moverFoco}
        >
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={mesAnterior}
              className="rounded-luc-md p-1 text-luc-text-3 outline-none transition-colors hover:bg-luc-surface-2 hover:text-luc-text focus-visible:ring-2 focus-visible:ring-luc-accent"
            >
              <ChevronLeft aria-hidden size={16} />
            </button>
            <span className="text-[12.5px] font-semibold text-luc-text">{tituloMes(cursor)}</span>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={proximoMes}
              className="rounded-luc-md p-1 text-luc-text-3 outline-none transition-colors hover:bg-luc-surface-2 hover:text-luc-text focus-visible:ring-2 focus-visible:ring-luc-accent"
            >
              <ChevronRight aria-hidden size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10.5px] font-semibold text-luc-text-3">
            {DIAS_SEMANA.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulasDoMes(cursor).map((cel, i) =>
              cel === null ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: folgas não têm identidade própria
                <span key={`folga-${i}`} />
              ) : (
                <button
                  key={cel.iso}
                  ref={cel.iso === cursor.focoIso ? focoRef : undefined}
                  type="button"
                  data-dia-celula=""
                  tabIndex={cel.iso === cursor.focoIso ? 0 : -1}
                  aria-current={cel.iso === hoje ? "date" : undefined}
                  aria-pressed={cel.iso === value}
                  onClick={() => selecionar(cel.iso)}
                  className={`rounded-luc-md py-1 text-[11.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-luc-accent ${
                    cel.iso === value
                      ? "bg-luc-accent text-luc-bg font-bold"
                      : cel.iso === hoje
                        ? "bg-luc-accent-06 text-luc-accent"
                        : "text-luc-text hover:bg-luc-surface-2"
                  }`}
                >
                  {cel.dia}
                </button>
              ),
            )}
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => selecionar(hoje)}
              className="w-full rounded-luc-md border border-luc-border py-1.5 text-[11.5px] font-semibold text-luc-accent hover:bg-luc-accent-06"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
