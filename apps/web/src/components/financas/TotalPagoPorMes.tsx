"use client"

import { scaleLinear } from "@visx/scale"
import { BarChart3 } from "lucide-react"
import { useState } from "react"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { mesAno, mesCurto } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { PontoTotalPagoMes, SerieHistorica } from "@/core/use-cases/derive-analise-historica"
import type { DestaquesMes as Destaques } from "@/core/use-cases/derive-destaques-mes"
import { DestaquesMes } from "./DestaquesMes"

const WIDTH = 640
const HEIGHT = 190
const PAD_TOP = 22
const PAD_BOTTOM = 26
const PAD_X = 18

/** Um ponto sem cifra a exibir: mês fechado sem fato, ou mês corrente ainda sem Lançamento. */
function semValor(ponto: PontoTotalPagoMes): boolean {
  return ponto.estado === "sem-dado" || (ponto.estado === "em-curso" && ponto.valor === 0)
}

/** Rótulo textual de um ponto — traço + palavra, nunca só cor (mês parcial e ausência ditos por extenso). */
function textoPonto(ponto: PontoTotalPagoMes): string {
  const mes = mesAno(ponto.competencia)
  if (ponto.estado === "sem-dado") return `${mes} · sem dado`
  if (ponto.estado === "em-curso" && ponto.valor === 0) {
    return `${mes} · sem lançamento ainda · em curso`
  }
  const valor = formatBRL(ponto.valor)
  return ponto.estado === "em-curso" ? `${mes} · ${valor} · em curso` : `${mes} · ${valor}`
}

const ICONE = (
  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
    <BarChart3 aria-hidden size={15} />
  </span>
)

/**
 * Análise Histórica (issue #98): a série do Total Pago por Mês nas doze
 * Competências até a atual, como o protótipo Final — uma linha de trajetória, não
 * barras. Meses fechados formam a linha sólida com área; o mês corrente é a cauda
 * tracejada com um ponto oco ("em curso"), nunca comparado (CONTEXT.md "mês em
 * curso × mês fechado"). Mês sem fato **quebra** a linha (nunca a puxa até zero:
 * ausência ≠ zero, invariante #3) e vira um marcador oco distinto. A seção nunca
 * some: sem fatos na janela, mostra a limitação por extenso. Consome a série
 * pronta do use-case — nada de domínio é recalculado aqui (ADR-0010).
 */
export function TotalPagoPorMes({
  serie,
  destaques,
}: {
  serie: SerieHistorica
  destaques?: Destaques
}) {
  return (
    <section aria-labelledby="historico-heading" className="flex flex-col gap-[18px]">
      <SectionHeading
        id="historico-heading"
        title="Análise Histórica"
        variant="destaque"
        icon={ICONE}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-luc-text-3">
          Total Pago por Mês
        </span>
        <span className="text-xs text-luc-muted">
          A trajetória do total pago nos últimos 12 meses.
        </span>
      </div>
      {serie.estado === "sem-fatos" ? (
        <div className="rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 sm:px-[18px]">
          <p className="text-xs text-luc-text-3">Sem Lançamentos na janela de 12 meses ainda.</p>
        </div>
      ) : (
        <>
          <GraficoTotalPago pontos={serie.pontos} />
          {destaques && <DestaquesMes destaques={destaques} />}
        </>
      )}
    </section>
  )
}

/** O card do gráfico Visx + a tabela `sr-only` equivalente. Isola o estado de foco/hover. */
function GraficoTotalPago({ pontos }: { pontos: PontoTotalPagoMes[] }) {
  // Foco e hover à parte (como em `HistoriaConta`): passar o mouse por OUTRO
  // ponto não pode apagar o tooltip de quem está com foco de teclado.
  const [focado, setFocado] = useState<string | null>(null)
  const [emHover, setEmHover] = useState<string | null>(null)
  const ativo = focado ?? emHover

  // Escala só pelos meses fechados: o mês em curso é parcial e nunca dita a
  // comparação (CONTEXT.md "mês em curso × mês fechado"). Com `clamp`, um total
  // parcial grande satura no topo em vez de achatar a trajetória fechada.
  const valoresFechados = pontos
    .filter((ponto) => ponto.estado === "fechado")
    .map((ponto) => ponto.valor)
  const maxValor = Math.max(1, ...valoresFechados)
  const yScale = scaleLinear<number>({
    domain: [0, maxValor],
    range: [HEIGHT - PAD_BOTTOM, PAD_TOP],
    clamp: true,
  })

  const innerW = WIDTH - PAD_X * 2
  const xAt = (i: number) =>
    pontos.length === 1 ? WIDTH / 2 : PAD_X + (i * innerW) / (pontos.length - 1)
  const baseY = yScale(0)
  const coords = pontos.map((ponto, i) => ({ ponto, x: xAt(i), y: yScale(ponto.valor) }))

  // A linha/área cobre só corridas de meses fechados; qualquer não-fechado
  // (sem-dado ou o mês em curso) **interrompe** o traço — a linha nunca cruza um
  // buraco como se fosse zero (invariante #3).
  const corridas: (typeof coords)[] = []
  let corrida: typeof coords = []
  for (const c of coords) {
    if (c.ponto.estado === "fechado") corrida.push(c)
    else if (corrida.length) {
      corridas.push(corrida)
      corrida = []
    }
  }
  if (corrida.length) corridas.push(corrida)

  const caminhoLinha = (corrida: typeof coords) =>
    corrida.map((c, k) => `${k === 0 ? "M" : "L"}${c.x} ${c.y}`).join(" ")
  const caminhoArea = (corrida: typeof coords) => {
    const primeiro = corrida[0]
    const ultimo = corrida[corrida.length - 1]
    const topo = corrida.map((c) => `L${c.x} ${c.y}`).join(" ")
    return `M${primeiro.x} ${baseY} ${topo} L${ultimo.x} ${baseY} Z`
  }

  // Cauda tracejada: do último mês fechado até o ponto do mês em curso (parcial).
  const emCurso = coords.find((c) => c.ponto.estado === "em-curso" && c.ponto.valor > 0)
  const ultimoFechado = [...coords].reverse().find((c) => c.ponto.estado === "fechado")
  const cauda =
    emCurso && ultimoFechado
      ? `M${ultimoFechado.x} ${ultimoFechado.y} L${emCurso.x} ${emCurso.y}`
      : null

  const gridYs = [0.25, 0.5, 0.75].map((f) => yScale(maxValor * f))
  const hitW = pontos.length > 1 ? innerW / (pontos.length - 1) : 80
  const pontoAtivo = pontos.find((ponto) => ponto.competencia === ativo)
  const temEmCurso = pontos.some((ponto) => ponto.estado === "em-curso")

  return (
    <div className="rounded-[14px] border border-luc-border bg-luc-surface-2 p-4 sm:px-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-luc-text-3">
          Total pago por mês
        </span>
        <span className="font-mono text-[10.5px] text-luc-muted">
          {mesAno(pontos[0].competencia)} — {mesAno(pontos[pontos.length - 1].competencia)}
        </span>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-auto w-full"
        >
          <title>Total Pago por Mês</title>
          {gridYs.map((gy) => (
            <line
              key={gy}
              aria-hidden
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={gy}
              y2={gy}
              stroke="var(--luc-text-3)"
              strokeWidth={1}
              opacity={0.12}
            />
          ))}

          {corridas.map((corrida) => (
            <path
              key={`area-${corrida[0].ponto.competencia}`}
              aria-hidden
              d={caminhoArea(corrida)}
              fill="var(--luc-accent)"
              fillOpacity={0.08}
              stroke="none"
            />
          ))}
          {corridas.map((corrida) => (
            <path
              key={`linha-${corrida[0].ponto.competencia}`}
              aria-hidden
              d={caminhoLinha(corrida)}
              fill="none"
              stroke="var(--luc-accent)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {cauda && (
            <path
              aria-hidden
              d={cauda}
              fill="none"
              stroke="var(--luc-accent)"
              strokeWidth={2.2}
              strokeDasharray="3 5"
              strokeLinecap="round"
              opacity={0.6}
            />
          )}

          {coords.map(({ ponto, x, y }) => {
            const compartilhado = {
              "data-testid": "total-pago-ponto",
              "data-estado": ponto.estado,
              tabIndex: 0,
              role: "graphics-symbol",
              "aria-label": textoPonto(ponto),
              onMouseEnter: () => setEmHover(ponto.competencia),
              onMouseLeave: () =>
                setEmHover((atual) => (atual === ponto.competencia ? null : atual)),
              onFocus: () => setFocado(ponto.competencia),
              onBlur: () => setFocado((atual) => (atual === ponto.competencia ? null : atual)),
              className: "cursor-pointer outline-none focus-visible:opacity-70",
            }
            // Alvo invisível de largura de faixa: hover/foco generosos sem depender
            // do raio minúsculo do marcador.
            const hit = (
              <rect
                x={x - hitW / 2}
                y={PAD_TOP}
                width={hitW}
                height={baseY - PAD_TOP}
                fill="transparent"
              />
            )

            if (ponto.estado === "sem-dado") {
              // Mês fechado sem fato: marcador oco na base, desconectado da linha —
              // ausência visível, não um ponto de zero (invariante #3).
              return (
                <g key={ponto.competencia} {...compartilhado}>
                  {hit}
                  <circle
                    cx={x}
                    cy={baseY}
                    r={3}
                    fill="none"
                    stroke="var(--luc-text-3)"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                </g>
              )
            }

            if (ponto.estado === "em-curso" && ponto.valor === 0) {
              // Mês corrente ainda sem Lançamento: ponto oco na base + rótulo, nunca
              // um zero disfarçado (invariante #3).
              return (
                <g key={ponto.competencia} {...compartilhado}>
                  {hit}
                  <circle
                    cx={x}
                    cy={baseY}
                    r={4}
                    fill="none"
                    stroke="var(--luc-accent)"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                  />
                  <text
                    x={x}
                    y={baseY - 10}
                    textAnchor="middle"
                    className="text-[9px]"
                    fill="var(--luc-accent)"
                  >
                    (em curso)
                  </text>
                </g>
              )
            }

            if (ponto.estado === "em-curso") {
              // Ponto oco (open circle) no fim da cauda tracejada — parcial, por
              // forma além da cor.
              return (
                <g key={ponto.competencia} {...compartilhado}>
                  {hit}
                  <circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill="none"
                    stroke="var(--luc-accent)"
                    strokeWidth={2}
                  />
                  <text
                    x={x}
                    y={y - 11}
                    textAnchor="middle"
                    className="text-[9px]"
                    fill="var(--luc-accent)"
                  >
                    (em curso)
                  </text>
                </g>
              )
            }

            // Mês fechado: ponto sólido sobre a linha.
            return (
              <g key={ponto.competencia} {...compartilhado}>
                {hit}
                <circle cx={x} cy={y} r={3.5} fill="var(--luc-accent)" />
              </g>
            )
          })}
        </svg>

        {pontoAtivo && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 right-2 rounded-md border border-luc-border bg-luc-surface px-2 py-1 font-mono text-[10.5px] text-luc-text"
          >
            {textoPonto(pontoAtivo)}
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-luc-muted">
        {pontos.map((ponto) => (
          <span key={ponto.competencia}>{mesCurto(ponto.competencia)}</span>
        ))}
      </div>

      {temEmCurso && (
        <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-luc-muted">
          <span className="h-0 w-[15px] shrink-0 border-t-2 border-dashed border-luc-accent opacity-60" />
          <span>Último ponto: mês em curso (parcial).</span>
        </div>
      )}

      <table className="sr-only">
        <caption>Total Pago por Mês</caption>
        <thead>
          <tr>
            <th>Competência</th>
            <th>Valor</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {pontos.map((ponto) => (
            <tr key={ponto.competencia}>
              <td>{mesAno(ponto.competencia)}</td>
              <td>{semValor(ponto) ? "sem dado" : formatBRL(ponto.valor)}</td>
              <td>{ponto.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
