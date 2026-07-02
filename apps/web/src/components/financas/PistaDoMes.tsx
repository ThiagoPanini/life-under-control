import Link from "next/link"
import { formatBRL } from "@/core/domain/money"
import type { EstadoMarcador, MarcadorPista } from "@/core/use-cases/derive-forma-competencia"

/**
 * A Pista do mês (issue #58): régua horizontal dos dias 1–31 com um marcador
 * clicável por vencimento. `interativa=false` produz a mini-pista só-leitura
 * do Painel (#47) — mesmo componente, mesmo cálculo de posição/agrupamento,
 * sem link nem foco (marcadores com `title`, sem clique).
 */

const TICKS_FIXOS = [1, 5, 10, 15, 20, 25]

const ESTADO: Record<EstadoMarcador, { label: string; dot: string }> = {
  quitada: { label: "quitada", dot: "bg-luc-success" },
  "a-vencer": { label: "vence em até 3 dias", dot: "border-2 border-luc-warn bg-transparent" },
  aguardando: { label: "aguardando", dot: "bg-luc-text-3" },
}

const PRIORIDADE: EstadoMarcador[] = ["a-vencer", "aguardando", "quitada"]

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Último dia civil do mês da Competência (`YYYY-MM`) — pega 29/02 em ano bissexto. */
export function ultimoDiaDoMes(competencia: string): number {
  const [ano, mes] = competencia.split("-").map(Number)
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Posição (0–100) de um dia (`YYYY-MM-DD`) na régua do mês. */
export function posicaoPercentual(dia: string, ultimoDia: number): number {
  const diaDoMes = Number(dia.slice(8, 10))
  return ((diaDoMes - 1) / (ultimoDia - 1)) * 100
}

export type GrupoMarcador = { dia: string; itens: MarcadorPista[] }

/** Vencimentos no mesmo dia colidem num único grupo — nenhum se perde. */
export function agruparPorDia(marcadores: MarcadorPista[]): GrupoMarcador[] {
  const porDia = new Map<string, MarcadorPista[]>()
  for (const m of marcadores) {
    const lista = porDia.get(m.dia) ?? []
    lista.push(m)
    porDia.set(m.dia, lista)
  }
  return [...porDia.entries()]
    .map(([dia, itens]) => ({ dia, itens }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

/** O estado mais urgente do grupo dita a cor do marcador agrupado. */
export function estadoPrioritarioDoGrupo(itens: MarcadorPista[]): EstadoMarcador {
  for (const estado of PRIORIDADE) {
    if (itens.some((item) => item.estado === estado)) return estado
  }
  return "aguardando"
}

function valorTexto(m: MarcadorPista): string {
  if (m.valorEsperado == null) return "sem histórico"
  return m.estado === "quitada" ? formatBRL(m.valorEsperado) : `~${formatBRL(m.valorEsperado)}`
}

function descricaoMarcador(m: MarcadorPista): string {
  const dd = m.dia.slice(8, 10)
  return `${m.titulo} · dia ${dd} · ${ESTADO[m.estado].label} · ${valorTexto(m)}`
}

function Marcador({
  grupo,
  ultimoDia,
  interativa,
}: {
  grupo: GrupoMarcador
  ultimoDia: number
  interativa: boolean
}) {
  const left = `${posicaoPercentual(grupo.dia, ultimoDia)}%`
  const dd = grupo.dia.slice(8, 10)

  if (grupo.itens.length === 1) {
    const item = grupo.itens[0]
    const descricao = descricaoMarcador(item)
    const dot = ESTADO[item.estado].dot

    if (!interativa) {
      return (
        <span
          className="-translate-x-1/2 absolute top-1/2 flex h-3.5 w-3.5 -translate-y-1/2 items-center justify-center"
          style={{ left }}
          title={descricao}
        >
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        </span>
      )
    }

    return (
      <Link
        href={`/areas/financas/pagamentos-recorrentes/${item.contaId}`}
        aria-label={descricao}
        className="group -translate-x-1/2 absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
        style={{ left }}
      >
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span
          role="tooltip"
          aria-hidden
          className="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 mb-1.5 whitespace-nowrap rounded-luc-sm bg-luc-surface-3 px-2 py-1 text-[10.5px] text-luc-text-2 opacity-0 shadow-lg group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {descricao}
        </span>
      </Link>
    )
  }

  const estadoGrupo = estadoPrioritarioDoGrupo(grupo.itens)
  const dot = ESTADO[estadoGrupo].dot
  const tituloGrupo = `${grupo.itens.length} vencimentos · dia ${dd}`

  if (!interativa) {
    return (
      <span
        className="-translate-x-1/2 absolute top-1/2 flex h-3.5 w-3.5 -translate-y-1/2 items-center justify-center"
        style={{ left }}
        title={tituloGrupo}
      >
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </span>
    )
  }

  return (
    <span
      className="group -translate-x-1/2 absolute top-1/2 block h-6 w-6 -translate-y-1/2"
      style={{ left }}
    >
      <button
        type="button"
        aria-label={tituloGrupo}
        className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
      >
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </button>
      <span className="-translate-x-1/2 absolute bottom-full left-1/2 mb-1.5 flex flex-col gap-0.5 whitespace-nowrap rounded-luc-sm bg-luc-surface-3 px-2 py-1 text-[10.5px] opacity-0 shadow-lg group-hover:opacity-100 group-focus-within:opacity-100">
        {grupo.itens.map((item) => (
          <Link
            key={item.contaId}
            href={`/areas/financas/pagamentos-recorrentes/${item.contaId}`}
            className="text-luc-text-2 hover:text-luc-accent-bright hover:underline"
          >
            {descricaoMarcador(item)}
          </Link>
        ))}
      </span>
    </span>
  )
}

export function PistaDoMes({
  competencia,
  hoje,
  marcadores,
  interativa = true,
}: {
  competencia: string
  hoje: string
  marcadores: MarcadorPista[]
  interativa?: boolean
}) {
  const ultimoDia = ultimoDiaDoMes(competencia)
  const grupos = agruparPorDia(marcadores)
  const ticks = [...new Set([...TICKS_FIXOS, ultimoDia])].sort((a, b) => a - b)
  const hojeNoMes = hoje.slice(0, 7) === competencia

  return (
    <div className="relative pt-5 pb-6">
      <div className="relative h-[3px] rounded-full bg-luc-border">
        {hojeNoMes && (
          <span
            aria-hidden
            className="-translate-x-1/2 absolute top-1/2 h-3 w-[2px] -translate-y-1/2 bg-luc-accent"
            style={{ left: `${posicaoPercentual(hoje, ultimoDia)}%` }}
          />
        )}
        {hojeNoMes && (
          <span
            className="-translate-x-1/2 absolute top-full mt-1 font-mono text-[10px] text-luc-accent"
            style={{ left: `${posicaoPercentual(hoje, ultimoDia)}%` }}
          >
            hoje
          </span>
        )}
        {grupos.map((grupo) => (
          <Marcador key={grupo.dia} grupo={grupo} ultimoDia={ultimoDia} interativa={interativa} />
        ))}
      </div>
      <div className="relative mt-2 h-3">
        {ticks.map((dia) => (
          <span
            key={dia}
            aria-hidden
            className="-translate-x-1/2 absolute font-mono text-[10px] text-luc-faint"
            style={{ left: `${posicaoPercentual(`${competencia}-${pad2(dia)}`, ultimoDia)}%` }}
          >
            {dia}
          </span>
        ))}
      </div>
    </div>
  )
}
