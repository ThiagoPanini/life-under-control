import { MESES } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { CenarioMes } from "@/core/use-cases/derive-cenario-mes"

/**
 * **Cenário de Pagamentos do Mês** (redesign Final da Análise): a leitura em
 * três tempos do mês vigente — o pago (exato), o gasto ainda estimado (`~`,
 * médias das Contas em aberto) e a projeção de fechamento comparada ao mês
 * anterior. Espelha o shape honesto do use-case: sem histórico vira `—`, nunca
 * `R$ 0,00` disfarçado; o delta compara projeção de mês cheio, não acumulado
 * parcial (#48).
 */

function ddmm(dataIso: string): string {
  return `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`
}

function nomeDoMes(competencia: string): string {
  return MESES[Number(competencia.slice(5, 7)) - 1].toLowerCase()
}

function textoDelta(percentual: number): string {
  return `${percentual >= 0 ? "+" : "−"}${Math.abs(percentual).toFixed(1).replace(".", ",")}%`
}

function Leitura({
  label,
  valor,
  divisoria = false,
  children,
}: {
  label: string
  valor: React.ReactNode
  divisoria?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${
        divisoria
          ? "border-luc-row-line border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-[18px]"
          : ""
      }`}
    >
      <h4 className="text-[11px] font-bold uppercase tracking-[.13em] text-luc-text-3">{label}</h4>
      {valor}
      {children}
    </div>
  )
}

export function CenarioPagamentosMes({ cenario }: { cenario: CenarioMes }) {
  const { quitadas, total } = cenario.quitadas
  const progresso = total > 0 ? Math.round((quitadas / total) * 100) : 0

  const faltaNode =
    cenario.pendentes === 0 ? (
      <>
        <span className="whitespace-nowrap font-mono text-[26px] font-semibold tracking-[-0.02em] text-luc-text-2">
          {formatBRL(0)}
        </span>
        <span className="text-[11.5px] text-luc-muted">nenhuma Conta em aberto</span>
      </>
    ) : cenario.faltaEstimada.estado === "sem-historico" ? (
      <>
        <span className="whitespace-nowrap font-mono text-[26px] font-semibold tracking-[-0.02em] text-luc-text-2">
          —
        </span>
        <span className="text-[11.5px] text-luc-muted">sem histórico para estimar</span>
      </>
    ) : (
      <>
        <span className="whitespace-nowrap font-mono text-[26px] font-semibold tracking-[-0.02em] text-luc-text-2">
          ~{formatBRL(cenario.faltaEstimada.valor)}
        </span>
        <span className="text-[11.5px] text-luc-muted">
          {cenario.pendentes} Conta{cenario.pendentes === 1 ? "" : "s"} até {ddmm(cenario.fimDoMes)}{" "}
          · estimativa
        </span>
      </>
    )

  const projecaoNode = (
    <span className="whitespace-nowrap font-mono text-[26px] font-semibold tracking-[-0.02em] text-luc-text">
      {cenario.projecao.estado === "sem-estimativa"
        ? "—"
        : cenario.projecao.estado === "estimada"
          ? `~${formatBRL(cenario.projecao.valor)}`
          : formatBRL(cenario.projecao.valor)}
    </span>
  )

  const comparativoNode =
    cenario.comparativo.estado === "comparado" ? (
      <span
        data-tone={cenario.comparativo.percentual >= 0 ? "warn" : "success"}
        className={`font-mono text-[11.5px] ${
          cenario.comparativo.percentual >= 0 ? "text-luc-warn" : "text-luc-success"
        }`}
      >
        {textoDelta(cenario.comparativo.percentual)} vs {nomeDoMes(cenario.comparativo.mesAnterior)}
      </span>
    ) : (
      <span className="font-mono text-[11.5px] text-luc-muted">sem base anterior</span>
    )

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-[3px]">
        <h3 className="text-[11px] font-bold uppercase tracking-[.13em] text-luc-text-3">
          Cenário de Pagamentos do Mês
        </h3>
        <p className="text-[12px] text-luc-muted">
          O que já foi pago, o que ainda está comprometido e a projeção para o fechamento do mês.
        </p>
      </div>

      <div className="rounded-[13px] border border-luc-border bg-luc-surface-2">
        <div className="grid grid-cols-1 gap-4 px-[18px] py-4 sm:grid-cols-3 sm:gap-[18px]">
          <Leitura
            label={`Pago até o dia ${cenario.hoje.slice(8, 10)}`}
            valor={
              <span className="whitespace-nowrap font-mono text-[26px] font-semibold tracking-[-0.02em] text-luc-text">
                {formatBRL(cenario.pago)}
              </span>
            }
          >
            <div className="mt-[3px] flex items-center gap-2.5">
              <div
                aria-hidden
                className="flex h-[5px] min-w-[60px] flex-1 overflow-hidden rounded-full bg-white/[0.07]"
              >
                <div
                  className="shrink-0 rounded-full bg-luc-success"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-luc-muted">
                {quitadas}/{total} quitadas
              </span>
            </div>
          </Leitura>

          <Leitura label="Gasto ainda estimado" valor={null} divisoria>
            {faltaNode}
          </Leitura>

          <Leitura label="Projeção do mês" valor={projecaoNode} divisoria>
            {comparativoNode}
          </Leitura>
        </div>
      </div>
    </div>
  )
}
