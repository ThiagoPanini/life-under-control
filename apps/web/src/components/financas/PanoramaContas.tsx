import { Button } from "@/components/ds/Button"
import { Pill } from "@/components/ds/Pill"
import { FAROL } from "@/components/financas/BillCard"
import { BillLogoTile } from "@/components/financas/BillLogoTile"
import { formatBRL } from "@/core/domain/money"
import type { FarolEstado } from "@/core/use-cases/derive-bill-card"
import type { ValorLinha } from "@/core/use-cases/derive-linha-conta"

/** Um bloco do Panorama: a Conta com ocorrência no mês vigente, já derivada (farol #62 + valor #56). */
export type BlocoPanorama = {
  billId: string
  nome: string
  icon: string
  logoUrl: string | null
  farol: FarolEstado
  frase: string
  valor: ValorLinha
  /** Href da baixa já preenchida; `null` quando quitada (não há o que registrar). */
  registrarHref: string | null
}

/** Frase de urgência acompanha o farol: warn quando aperta, muted quando respira. */
const FRASE_COR: Record<FarolEstado, string> = {
  vermelho: "text-luc-warn",
  amarelo: "text-luc-warn",
  cinza: "text-luc-muted",
  verde: "text-luc-muted",
}

function BlocoConta({ bloco }: { bloco: BlocoPanorama }) {
  const quitada = bloco.farol === "verde"
  const estimativa = bloco.valor.estado === "estimativa"

  const valorNode =
    bloco.valor.estado === "real" ? (
      <span className="whitespace-nowrap font-mono text-[19px] font-semibold tracking-[-0.02em] text-luc-text">
        {formatBRL(bloco.valor.valor)}
      </span>
    ) : (
      <span className="whitespace-nowrap font-mono text-[19px] font-semibold tracking-[-0.02em] text-luc-text-2">
        {bloco.valor.media == null ? "—" : `~${formatBRL(bloco.valor.media)}`}
      </span>
    )

  return (
    <li
      data-testid="bloco-panorama"
      data-farol={bloco.farol}
      className={`flex min-w-0 flex-col rounded-[13px] border px-[15px] pt-3.5 pb-3 ${
        bloco.farol === "vermelho" ? "border-luc-warn/40" : "border-luc-border"
      } ${quitada ? "bg-luc-surface-1 opacity-[0.62] saturate-[0.55]" : "bg-luc-surface-2"}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <BillLogoTile icon={bloco.icon} logoUrl={bloco.logoUrl} size={30} iconSize={16} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-luc-text">
          {bloco.nome}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {valorNode}
        <Pill tone={FAROL[bloco.farol].tone} aria-label={FAROL[bloco.farol].aria}>
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${FAROL[bloco.farol].dot}`}
          />
          {FAROL[bloco.farol].label}
        </Pill>
      </div>

      <div className="mt-[5px] pb-[11px] font-mono text-[10.5px]">
        <span className={FRASE_COR[bloco.farol]}>{bloco.frase}</span>
        {estimativa && <span className="text-luc-faint"> · valor estimado</span>}
      </div>

      {bloco.registrarHref != null && (
        <div className="mt-auto flex border-luc-row-line border-t pt-2.5">
          <Button
            href={bloco.registrarHref}
            variant="secondary"
            className="min-h-[30px] flex-1 px-3 py-1 text-xs"
          >
            Registrar pagamento
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * **Panorama de Contas** (redesign Final da Análise): um bloco por Conta com
 * ocorrência no mês vigente, na mesma ordem de urgência das linhas (#62) —
 * vencida na frente, quitada apagando no fim. O bloco repete a leitura da
 * linha híbrida (farol, frase, valor estado-dependente) em formato de
 * varredura: valor real quando quitada, `~média` quando em aberto
 * (CONTEXT.md: o valor exato só nasce no Lançamento — nunca zero disfarçado).
 */
export function PanoramaContas({ blocos }: { blocos: BlocoPanorama[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-[3px]">
        <h3 className="text-[11px] font-bold uppercase tracking-[.13em] text-luc-text-3">
          Panorama de Contas
        </h3>
        <p className="text-[12px] text-luc-muted">Cenário real das Contas cadastradas.</p>
      </div>

      {blocos.length === 0 ? (
        <p className="text-[12px] text-luc-muted">Nenhuma Conta com ocorrência neste mês.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {blocos.map((bloco) => (
            <BlocoConta key={bloco.billId} bloco={bloco} />
          ))}
        </ul>
      )}
    </div>
  )
}
