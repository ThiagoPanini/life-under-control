"use client"

import { LayoutList } from "lucide-react"
import Link from "next/link"
import { useLayoutEffect, useRef, useState } from "react"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { mesAno } from "@/core/domain/bill"
import { formatBRL, formatBRLSemCentavos } from "@/core/domain/money"
import type { GridCelula } from "@/core/use-cases/derive-bill-card"
import type { LinhaAnalitica } from "@/core/use-cases/derive-visao-analitica"
import { GRID } from "./BillCard"
import { BillIcon } from "./BillIcon"
import { ESTADO_MES } from "./estado-mes"

/**
 * Uma linha da tabela pronta para render: a derivação do núcleo (#127) + os
 * dados de identidade da Conta (nome/ícone/logo/vencimento) que a borda junta.
 * `datasPagamento` mapeia Competência → data da baixa, para o tooltip do sinaleiro.
 */
export type ItemAnalitico = {
  linha: LinhaAnalitica
  nome: string
  icon: string
  logoUrl: string | null
  vencimentoDesc: string
  datasPagamento: Record<string, string | null>
}

const SPARK_W = 108
const SPARK_H = 30

/** Alvo do tooltip único da tabela: a chave, o nó âncora e o conteúdo (título + linhas). */
type Alvo = { chave: string; el: Element; titulo: string; linhas: string[] }

/** Handlers do tooltip único — servem tanto a `<button>` (HTML) quanto a `<circle>` (SVG). */
type LigarTooltip = (
  chave: string,
  titulo: string,
  linhas: string[],
) => {
  onMouseEnter: (e: React.MouseEvent<Element>) => void
  onMouseLeave: () => void
  onFocus: (e: React.FocusEvent<Element>) => void
  onBlur: () => void
}

/**
 * **Visão Analítica por Conta** (issue #127): a última seção do cockpit — uma
 * tabela real, uma linha por Conta ativa na ordem de urgência do Panorama (#93),
 * com o sinaleiro histórico (#21), Pontualidade 12 (#58/#59), sparkline + Média
 * da janela e o valor/estado da ocorrência vigente. O switch "Incluir encerradas"
 * revela as encerradas ao fim, atenuadas. Consome o derivado pronto (`derivarVisaoAnaliticaContas`);
 * nada é recalculado aqui (invariante #3; ADR-0003). Espelha o Mapa do Ano: cabeçalho
 * destaque com chip, matriz que rola na horizontal com a coluna da Conta fixa, e um
 * tooltip `position: fixed` que escapa o `overflow` do scroll sem recorte.
 */
export function VisaoAnaliticaContas({ itens }: { itens: ItemAnalitico[] }) {
  // Foco (teclado) e hover ficam separados para o mouse não apagar o foco do teclado;
  // `focado` vence. O hover assume ao entrar (zera o foco), como no Mapa do Ano.
  const [focado, setFocado] = useState<Alvo | null>(null)
  const [emHover, setEmHover] = useState<Alvo | null>(null)
  const alvo = focado ?? emHover
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false)

  // Sem Conta registrada, a seção some (AC #127).
  if (itens.length === 0) return null

  const temEncerradas = itens.some((it) => it.linha.encerrada)
  const visiveis = mostrarEncerradas ? itens : itens.filter((it) => !it.linha.encerrada)

  // Trocar o filtro pode esconder a linha do alvo — some com o tooltip para ele não
  // ficar sobre um nó desmontado nem descrever uma Conta fora da vista.
  function alternarEncerradas(v: boolean) {
    setMostrarEncerradas(v)
    setFocado(null)
    setEmHover(null)
  }

  return (
    <section aria-labelledby="visao-analitica-heading" className="flex flex-col gap-3">
      <div aria-hidden className="border-luc-border border-t" />
      <SectionHeading
        id="visao-analitica-heading"
        title="Visão Analítica por Conta"
        variant="destaque"
        icon={
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
            <LayoutList aria-hidden size={15} />
          </span>
        }
      />

      <div className="flex flex-col gap-3 rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4 sm:p-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-luc-text-3">
              Detalhes das Contas
            </span>
            <span className="text-xs text-luc-muted">
              Visão detalhada de cada conta registrada.
            </span>
          </div>
          {temEncerradas && (
            <SwitchEncerradas mostrarEncerradas={mostrarEncerradas} onChange={alternarEncerradas} />
          )}
        </div>

        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full border-separate border-spacing-0 text-left">
            <caption className="sr-only">
              Cada Conta com o histórico das últimas 12 ocorrências, pontualidade, valores e o
              estado do mês vigente.
            </caption>
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-[0.09em] text-luc-text-3">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-luc-surface-2 px-3 py-2 pl-4 sm:pl-3"
                >
                  Conta
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">
                  Últimas 12
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
                  Pontualidade
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">
                  Valores
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
                  Média 12
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
                  Valor
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-center">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 pr-4 sm:pr-3">
                  <span className="sr-only">Registrar pagamento</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => (
                <LinhaTabela
                  key={item.linha.billId}
                  item={item}
                  alvo={alvo}
                  setFocado={setFocado}
                  setEmHover={setEmHover}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {alvo && <Tooltip key={alvo.chave} alvo={alvo} />}
    </section>
  )
}

function LinhaTabela({
  item,
  alvo,
  setFocado,
  setEmHover,
}: {
  item: ItemAnalitico
  alvo: Alvo | null
  setFocado: (v: Alvo | null) => void
  setEmHover: (v: Alvo | null) => void
}) {
  const { linha, nome, icon, logoUrl } = item
  const encerrada = linha.encerrada
  const registrarHref =
    encerrada || linha.estado === "pago"
      ? null
      : `/areas/financas/pagamentos-recorrentes?registrar=${linha.billId}`

  // Handlers que qualquer alvo (célula, ponto, pontualidade) usa para o tooltip único.
  const ligar: LigarTooltip = (chave, titulo, linhas) => ({
    onMouseEnter: (e) => {
      setFocado(null)
      setEmHover({ chave, el: e.currentTarget, titulo, linhas })
    },
    onMouseLeave: () => setEmHover(null),
    onFocus: (e) => setFocado({ chave, el: e.currentTarget, titulo, linhas }),
    onBlur: () => setFocado(null),
  })

  const celulaCin = (celula: GridCelula) => {
    const meta = GRID[celula.estado]
    const partes = [mesAno(celula.competencia), meta.label]
    // A célula do sinaleiro é o alvo de teclado: carrega valor + data da baixa,
    // para o usuário de teclado ter a leitura completa que o ponto da sparkline
    // (só hover) também dá.
    if (celula.valor != null) partes.push(formatBRL(celula.valor))
    const data = item.datasPagamento[celula.competencia]
    if (data) partes.push(`pago em ${formatarDDMM(data)}`)
    const chave = `${linha.billId}|sin|${celula.competencia}`
    const ativo = alvo?.chave === chave
    return (
      <button
        type="button"
        key={celula.competencia}
        data-testid="sinaleiro-cell"
        data-estado={celula.estado}
        aria-label={partes.join(" · ")}
        {...ligar(chave, nome, partes)}
        className={`h-2.5 w-2.5 shrink-0 rounded-[3px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-luc-accent ${meta.className} ${ativo ? "ring-2 ring-luc-accent" : ""}`}
      />
    )
  }

  const pontualidadeNode = () => {
    if (linha.pontualidade.estado === "sem-historico") {
      return <span className="font-mono text-[12px] text-luc-faint">—</span>
    }
    const { percentual, frase } = linha.pontualidade
    const chave = `${linha.billId}|pont`
    return (
      <button
        type="button"
        aria-label={`Pontualidade ${percentual}% · ${frase}`}
        {...ligar(chave, nome, [`Pontualidade ${percentual}% em dia`, frase])}
        className="font-mono text-[12px] text-luc-text-2 outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
      >
        {percentual}%
      </button>
    )
  }

  const valorNode = () => {
    if (encerrada) return <span className="font-mono text-[12.5px] text-luc-faint">—</span>
    if (linha.valor.estado === "pago") {
      return (
        <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-luc-text-strong">
          {formatBRL(linha.valor.total)}
        </span>
      )
    }
    if (linha.valor.estado === "estimativa") {
      return (
        <span className="whitespace-nowrap">
          <span className="font-mono text-[12.5px] font-semibold text-luc-text-2">
            ≈ {formatBRLSemCentavos(linha.valor.media)}
          </span>
          <span className="block text-[9.5px] text-luc-faint">estimado</span>
        </span>
      )
    }
    return <span className="font-mono text-[12.5px] text-luc-faint">—</span>
  }

  return (
    <tr
      data-testid="linha-analitica"
      data-encerrada={encerrada}
      className={`border-luc-border border-t ${encerrada ? "opacity-60" : ""}`}
    >
      <th
        scope="row"
        className="sticky left-0 z-10 border-luc-border border-t bg-luc-surface-2 px-3 py-2.5 pl-4 sm:pl-3"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-luc-md bg-luc-surface-3 text-luc-text-2">
            {logoUrl ? (
              // biome-ignore lint/performance/noImgElement: logo presign local, sem loader do Next
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <BillIcon name={icon} size={16} />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <Link
              href={`/areas/financas/pagamentos-recorrentes/${linha.billId}`}
              className="max-w-[180px] truncate text-[13px] font-bold text-luc-text outline-none hover:text-luc-accent-bright focus-visible:ring-2 focus-visible:ring-luc-accent"
            >
              {nome}
            </Link>
            <span className="truncate font-mono text-[10.5px] text-luc-faint">
              {item.vencimentoDesc}
            </span>
          </span>
        </span>
      </th>

      <td className="border-luc-border border-t px-3 py-2.5">
        <div className="flex items-center gap-[5px]">{linha.grid.map(celulaCin)}</div>
      </td>

      <td className="border-luc-border border-t px-3 py-2.5 text-right">{pontualidadeNode()}</td>

      <td className="border-luc-border border-t px-3 py-2.5">
        <MiniSparkline
          billId={linha.billId}
          nome={nome}
          grid={linha.grid}
          sparkline={linha.sparkline}
          ligar={ligar}
          alvo={alvo}
        />
      </td>

      <td className="border-luc-border border-t px-3 py-2.5 text-right">
        <span className="whitespace-nowrap font-mono text-[12px] text-luc-text-2">
          {linha.media == null ? "—" : formatBRL(linha.media)}
        </span>
      </td>

      <td className="border-luc-border border-t px-3 py-2.5 text-right">{valorNode()}</td>

      <td className="border-luc-border border-t px-3 py-2.5 text-center">
        {encerrada ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-luc-surface-3 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-luc-faint">
            encerrada
          </span>
        ) : (
          <PillEstado estado={linha.estado} />
        )}
      </td>

      <td className="border-luc-border border-t px-3 py-2.5 pr-4 text-right sm:pr-3">
        {registrarHref && (
          <Link
            href={registrarHref}
            className="inline-flex min-h-8 items-center whitespace-nowrap rounded-luc-md border border-luc-border bg-luc-surface-3 px-2.5 py-1 text-[11px] font-medium text-luc-text-2 outline-none transition-colors hover:border-luc-border-strong hover:text-luc-text focus-visible:ring-2 focus-visible:ring-luc-accent"
          >
            Registrar
          </Link>
        )}
      </td>
    </tr>
  )
}

function PillEstado({ estado }: { estado: LinhaAnalitica["estado"] }) {
  const leitura = ESTADO_MES[estado]
  return (
    <span
      role="img"
      data-tone={leitura.tone}
      aria-label={leitura.aria}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-luc-sm border px-[9px] py-[3px] text-[10.5px] font-bold tracking-[0.02em] ${leitura.pill}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${leitura.dot}`} />
      {leitura.label}
    </span>
  )
}

/**
 * Sparkline compacta dos valores pagos da janela do sinaleiro — a linha **quebra
 * na lacuna** (mês sem pagamento nunca vira zero, CONTEXT.md #3). Cada ponto pago
 * é um alvo (hover/foco) com tooltip Competência · valor, na linguagem do Total
 * Pago por Mês. Alinhada célula a célula ao sinaleiro (mesma janela de 12).
 */
function MiniSparkline({
  billId,
  nome,
  grid,
  sparkline,
  ligar,
  alvo,
}: {
  billId: string
  nome: string
  grid: GridCelula[]
  sparkline: (number | null)[]
  ligar: LigarTooltip
  alvo: Alvo | null
}) {
  const pagos = sparkline.filter((v): v is number => v != null)
  if (pagos.length === 0) {
    return <span className="font-mono text-[11px] text-luc-faint">sem histórico</span>
  }
  const min = Math.min(...pagos)
  const max = Math.max(...pagos)
  const range = max - min || 1
  const n = Math.max(sparkline.length - 1, 1)
  const px = (i: number) => 3 + (i * (SPARK_W - 6)) / n
  const py = (v: number) => SPARK_H - 3 - ((v - min) / range) * (SPARK_H - 8)

  // Segmentos: começa novo caminho depois de cada lacuna (a linha não atravessa o furo).
  const d = sparkline
    .map((v, i) => {
      if (v == null) return null
      const prev = i > 0 ? sparkline[i - 1] : null
      return `${prev == null ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`
    })
    .filter(Boolean)
    .join(" ")

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="h-[30px] w-[108px]"
      role="img"
      aria-label={`Valores pagos das 12 ocorrências de ${nome}`}
    >
      <path
        d={d}
        fill="none"
        stroke="var(--luc-accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {sparkline.map((v, i) => {
        if (v == null) return null
        const competencia = grid[i]?.competencia ?? ""
        const chave = `${billId}|spk|${competencia}`
        const ativo = alvo?.chave === chave
        // Ponto pago = alvo **só de hover** (a leitura de teclado vem da célula do
        // sinaleiro, que carrega o mesmo valor). Só os handlers de mouse do tooltip.
        const { onMouseEnter, onMouseLeave } = ligar(chave, nome, [
          mesAno(competencia),
          formatBRL(v),
        ])
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: ponto é enfeite de hover (mouse); a leitura por teclado/leitor de tela vem da célula do sinaleiro e do aria-label do svg
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: índice É a posição temporal na janela
            key={i}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            cx={px(i)}
            cy={py(v)}
            r={ativo ? 3.4 : 2.2}
            fill="var(--luc-accent-bright)"
            className="cursor-pointer"
          />
        )
      })}
    </svg>
  )
}

/** Interruptor liga/desliga para incluir as Contas encerradas (off por padrão). */
function SwitchEncerradas({
  mostrarEncerradas,
  onChange,
}: {
  mostrarEncerradas: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mostrarEncerradas}
      onClick={() => onChange(!mostrarEncerradas)}
      className="group flex shrink-0 items-center gap-2 outline-none"
    >
      <span className="text-[11px] font-medium text-luc-text-3 transition-colors group-hover:text-luc-text-2">
        Incluir encerradas
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          mostrarEncerradas
            ? "border-luc-accent bg-luc-accent"
            : "border-luc-border bg-luc-surface-3"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-luc-text shadow-sm transition-transform ${
            mostrarEncerradas ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  )
}

/**
 * Tooltip flutuante único da tabela — mesma linguagem da tooltip do Mapa do Ano e
 * do Total Pago por Mês (superfície elevada + borda forte + sombra). `position:
 * fixed` ancorado ao **elemento** do alvo, escapando o `overflow` do scroll sem
 * recorte; relê a posição a cada scroll/resize e clampa ao viewport.
 */
function Tooltip({ alvo }: { alvo: Alvo }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; abaixo: boolean } | null>(null)

  useLayoutEffect(() => {
    const posicionar = () => {
      const el = alvo.el.getBoundingClientRect()
      const largura = ref.current?.offsetWidth ?? 0
      const altura = ref.current?.offsetHeight ?? 0
      const margem = 8
      const centro = Math.min(
        window.innerWidth - margem - largura / 2,
        Math.max(margem + largura / 2, el.left + el.width / 2),
      )
      const cabeAcima = el.top - altura - margem >= 0
      setPos({
        left: centro,
        top: cabeAcima ? el.top - margem : el.bottom + margem,
        abaixo: !cabeAcima,
      })
    }
    posicionar()
    window.addEventListener("scroll", posicionar, true)
    window.addEventListener("resize", posicionar)
    return () => {
      window.removeEventListener("scroll", posicionar, true)
      window.removeEventListener("resize", posicionar)
    }
  }, [alvo])

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: "fixed",
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        transform: pos?.abaixo ? "translate(-50%, 0)" : "translate(-50%, -100%)",
        visibility: pos ? "visible" : "hidden",
      }}
      className="pointer-events-none z-50 whitespace-nowrap rounded-luc-md border border-luc-border-strong bg-luc-surface-3 px-2.5 py-[7px] shadow-[0_12px_30px_rgba(0,0,0,.45)]"
    >
      <div className="text-[11px] font-bold text-luc-text">{alvo.titulo}</div>
      {alvo.linhas.map((texto, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: linhas fixas de texto do tooltip
          key={i}
          className={
            i === 0
              ? "mt-px font-mono text-[10.5px] text-luc-text-3"
              : "text-[11px] text-luc-text-2"
          }
        >
          {texto}
        </div>
      ))}
    </div>
  )
}

/** `YYYY-MM-DD` → `DD/MM` para o tooltip do sinaleiro. */
function formatarDDMM(data: string): string {
  const [, m, d] = data.split("-")
  return `${d}/${m}`
}
