import { formatBRL } from "@/core/domain/money"
import type { AgregadosMes } from "@/core/use-cases/derive-agregados-financas"

/**
 * Cockpit de Finanças (issue #22): os quatro agregados do mês no topo da Área,
 * somando todas as Contas ativas. Só o **pago** é exato (soma dos Lançamentos da
 * competência); **falta pagar** é estimativa do histórico e vem rotulada como tal
 * — não existe valor de conta não-paga (CONTEXT.md). Mês sem histórico mostra "—".
 */
export function CockpitFinancas({ agregados }: { agregados: AgregadosMes }) {
  const { totalPagoMes, contasEmAberto, gastoMensalMedio, estimativaFaltaPagar } = agregados
  return (
    <section className="flex flex-col gap-4 rounded-luc-lg border border-luc-border bg-luc-surface-1 p-5 sm:p-6">
      <p className="font-mono text-[11.5px] text-luc-text-3 uppercase tracking-[0.18em]">
        Este mês
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Stat rotulo="Pago no mês" valor={formatBRL(totalPagoMes)} />
        <Stat
          rotulo="Em aberto"
          valor={String(contasEmAberto)}
          sufixo={contasEmAberto === 1 ? "conta" : "contas"}
          alerta={contasEmAberto > 0}
        />
        <Stat
          rotulo="Gasto médio · 12m"
          valor={gastoMensalMedio == null ? "—" : formatBRL(gastoMensalMedio)}
        />
        <Stat
          rotulo="Falta pagar"
          valor={estimativaFaltaPagar == null ? "—" : formatBRL(estimativaFaltaPagar)}
          tag="estimativa"
        />
      </dl>

      <p className="text-luc-text-3 text-xs leading-snug">
        <span className="font-medium text-luc-text-2">Falta pagar</span> é uma <em>estimativa</em>{" "}
        derivada do histórico de cada Conta — só entram Contas em aberto que já foram pagas alguma
        vez. Não há valor exato a pagar: a Conta guarda o <em>quando</em>, nunca o <em>quanto</em>.
      </p>
    </section>
  )
}

/** Uma estatística do cockpit: rótulo em cima, valor grande embaixo, com tag/sufixo opcionais. */
function Stat({
  rotulo,
  valor,
  sufixo,
  tag,
  alerta,
}: {
  rotulo: string
  valor: string
  sufixo?: string
  tag?: string
  alerta?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="flex items-center gap-1.5 font-mono text-[11px] text-luc-text-3 uppercase tracking-[0.12em]">
        {rotulo}
        {tag && (
          <span className="rounded-full bg-luc-surface-2 px-1.5 py-px text-[9px] text-luc-text-3 lowercase tracking-[0.08em]">
            {tag}
          </span>
        )}
      </dt>
      <dd
        className={`flex items-baseline gap-1.5 font-semibold text-xl tracking-[-0.02em] ${
          alerta ? "text-luc-warn" : "text-luc-text"
        }`}
      >
        {valor}
        {sufixo && <span className="font-normal text-luc-text-3 text-xs">{sufixo}</span>}
      </dd>
    </div>
  )
}
