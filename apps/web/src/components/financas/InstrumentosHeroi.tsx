"use client"

import { useEffect, useState } from "react"
import { MetricCard } from "@/components/ds/MetricCard"
import { descreverMesPorExtenso } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { EstimativaMes } from "@/core/use-cases/derive-forma-competencia"
import type { Pontualidade12m } from "@/core/use-cases/derive-pontualidade"

/**
 * Instrumentos herói+3 (issue #58): "Falta pagar · {mês}" com contagem
 * animada (desliga com `prefers-reduced-motion`) + 3 métricas. Só formata e
 * anima — todo agregado chega pronto da forma-da-Competência (#61).
 */

const DURACAO_ANIMACAO_MS = 600

/** Anima de 0 até `valorFinal`; some com `prefers-reduced-motion` (mostra o valor final direto). */
function useContagemAnimada(valorFinal: number): number {
  const [valor, setValor] = useState(valorFinal)

  useEffect(() => {
    const reduzida = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduzida) {
      setValor(valorFinal)
      return
    }

    setValor(0)
    const inicio = performance.now()
    let frame: number
    function passo(agora: number) {
      const progresso = Math.min(1, (agora - inicio) / DURACAO_ANIMACAO_MS)
      setValor(Math.round(valorFinal * progresso))
      if (progresso < 1) frame = requestAnimationFrame(passo)
    }
    frame = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(frame)
  }, [valorFinal])

  return valor
}

export function InstrumentosHeroi({
  competencia,
  faltaPagar,
  pedemAtencaoAgora,
  totalPagoMes,
  gastoMensalMedio,
  pontualidade,
}: {
  competencia: string
  faltaPagar: EstimativaMes
  pedemAtencaoAgora: EstimativaMes
  totalPagoMes: number
  gastoMensalMedio: number | null
  pontualidade: Pontualidade12m
}) {
  const mes = descreverMesPorExtenso(competencia).split(" de ")[0]
  const valorFinal = faltaPagar.estado === "estimado" ? faltaPagar.valor : 0
  const valorAnimado = useContagemAnimada(valorFinal)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
      <section className="rounded-luc-lg border border-luc-border bg-luc-surface-2 p-5 lg:col-span-2">
        <div className="text-[11.5px] font-semibold text-luc-text-3">Falta pagar · {mes}</div>
        <div className="mt-2 font-mono text-[31px] font-semibold text-luc-text tracking-[-0.02em]">
          {faltaPagar.estado === "sem-historico" ? "—" : formatBRL(valorAnimado)}
        </div>
        <p className="mt-1 text-[11px] text-luc-muted">
          estimativa do histórico — o exato nasce no Lançamento
        </p>
        {pedemAtencaoAgora.estado === "estimado" && (
          <p className="mt-2 font-semibold text-[11.5px] text-luc-warn">
            ~{formatBRL(pedemAtencaoAgora.valor)} pedem atenção agora
          </p>
        )}
      </section>

      <MetricCard label="Total pago · mês" value={formatBRL(totalPagoMes)} />
      <MetricCard
        label="Gasto médio · 12m"
        value={gastoMensalMedio == null ? "—" : formatBRL(gastoMensalMedio)}
        support="meses completos"
      />
      <MetricCard
        label="Pontualidade · 12m"
        value={pontualidade.estado === "sem-historico" ? "—" : `${pontualidade.percentual}%`}
        support={
          pontualidade.estado === "calculada"
            ? `${pontualidade.percentual}% dos vencimentos no prazo`
            : undefined
        }
      />
    </div>
  )
}
