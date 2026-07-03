import { somarPedemAtencaoAgora } from "@/core/use-cases/derive-atencao-mes"
import type { FormaCompetencia } from "@/core/use-cases/derive-forma-competencia"
import type { InsightsCompetencia as InsightsCompetenciaModel } from "@/core/use-cases/derive-insights-competencia"
import type { Pontualidade12m } from "@/core/use-cases/derive-pontualidade"
import { BlocoCompetencia } from "./BlocoCompetencia"
import { InsightsCompetencia } from "./InsightsCompetencia"
import { InstrumentosHeroi } from "./InstrumentosHeroi"
import { PendenciasAnterioresChip } from "./PendenciasAnterioresChip"
import { PistaDoMes } from "./PistaDoMes"

/**
 * Cockpit de Pagamentos Recorrentes (issue #58): a lente de competência —
 * Bloco Competência + Pista do mês + pendências anteriores — e os
 * Instrumentos herói+3. Toda leitura vem da `FormaCompetencia` (#61); nada
 * aqui recalcula agregado a partir de Contas/Lançamentos.
 */
export function CockpitFinancas({
  competencia,
  hoje,
  forma,
  gastoMensalMedio,
  pontualidade,
  insights,
}: {
  competencia: string
  hoje: string
  forma: FormaCompetencia
  gastoMensalMedio: number | null
  pontualidade: Pontualidade12m
  insights: InsightsCompetenciaModel
}) {
  const pedemAtencaoAgora = somarPedemAtencaoAgora(forma.marcadores)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <BlocoCompetencia
          competencia={competencia}
          emCurso={insights.estadoCompetencia === "em-curso"}
          pago={forma.pago}
          projetado={forma.projetado}
          quitadas={forma.quitadas}
        />
        <div className="rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-luc-faint uppercase tracking-[0.14em]">
              Pista do mês
            </span>
            <PendenciasAnterioresChip pendencias={forma.pendenciasAnteriores} />
          </div>
          <PistaDoMes competencia={competencia} hoje={hoje} marcadores={forma.marcadores} />
        </div>
      </div>

      <InstrumentosHeroi
        competencia={competencia}
        faltaPagar={forma.faltaPagar}
        pedemAtencaoAgora={pedemAtencaoAgora}
        totalPagoMes={forma.pago}
        gastoMensalMedio={gastoMensalMedio}
        pontualidade={pontualidade}
      />

      <InsightsCompetencia insights={insights} />

      <p className="px-1 text-luc-text-3 text-xs leading-snug">
        <span className="font-medium text-luc-text-2">Falta pagar</span> é uma <em>estimativa</em>{" "}
        derivada do histórico de cada Conta. O valor exato só nasce no Lançamento.
      </p>
    </div>
  )
}
