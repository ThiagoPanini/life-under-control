import { Pencil } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { Pill, type PillTone } from "@/components/ds/Pill"
import { BillLogoTile } from "@/components/financas/BillLogoTile"
import { formatBRL } from "@/core/domain/money"
import type { EstadoMes, ValorCard } from "@/core/use-cases/derive-panorama-mensal"

/** Um bloco do Panorama: a Conta com ocorrência no mês vigente, já derivada (estado #93 + valor). */
export type BlocoPanorama = {
  billId: string
  nome: string
  icon: string
  logoUrl: string | null
  estado: EstadoMes
  frase: string
  valor: ValorCard
  /** Href da baixa já preenchida; `null` quando paga (não há o que registrar). */
  registrarHref: string | null
  /** Href da edição rápida (o lápis do card): abre o modal compacto (`?editar=`). */
  editarHref: string
}

/**
 * A leitura de cada estado do mês vigente (#93): rótulo, tom da pílula, ponto e
 * cor da frase. `vencida` (vencimento consumado) é o único que veste `danger`
 * (vermelho); `vence-em-breve` é atenção (âmbar); `pago`/`a-vencer` repousam.
 */
const ESTADO: Record<
  EstadoMes,
  { label: string; tone: PillTone; dot: string; frase: string; aria: string }
> = {
  pago: {
    label: "pago",
    tone: "success",
    dot: "bg-luc-success",
    frase: "text-luc-muted",
    aria: "Conta paga no mês",
  },
  "a-vencer": {
    label: "a vencer",
    tone: "neutral",
    dot: "bg-luc-text-3",
    frase: "text-luc-muted",
    aria: "Conta a vencer, vencimento distante",
  },
  "vence-em-breve": {
    label: "vence em breve",
    tone: "warn",
    dot: "border-2 border-luc-warn bg-transparent",
    frase: "text-luc-warn",
    aria: "Conta vence em breve",
  },
  vencida: {
    label: "vencida",
    tone: "danger",
    dot: "bg-luc-danger ring-2 ring-luc-danger/25",
    frase: "text-luc-danger",
    aria: "Conta vencida",
  },
}

function BlocoConta({ bloco }: { bloco: BlocoPanorama }) {
  const leitura = ESTADO[bloco.estado]
  const pago = bloco.estado === "pago"

  const valorNode =
    bloco.valor.estado === "pago" ? (
      <span className="whitespace-nowrap font-mono text-[19px] font-semibold tracking-[-0.02em] text-luc-text">
        {formatBRL(bloco.valor.total)}
      </span>
    ) : (
      <span className="whitespace-nowrap font-mono text-[19px] font-semibold tracking-[-0.02em] text-luc-text-2">
        {bloco.valor.estado === "estimativa" ? `≈ ${formatBRL(bloco.valor.media)}` : "—"}
      </span>
    )

  return (
    <li
      data-testid="bloco-panorama"
      data-estado={bloco.estado}
      className={`flex min-w-0 flex-col rounded-[13px] border px-[15px] pt-3.5 pb-3 transition-[border-color,background-color,opacity,filter] duration-150 motion-reduce:transition-none hover:bg-luc-surface-3 hover:opacity-100 hover:saturate-100 ${
        bloco.estado === "vencida"
          ? "border-luc-danger/40 hover:border-luc-danger/60"
          : "border-luc-border hover:border-luc-border-strong"
      } ${pago ? "bg-luc-surface-1 opacity-[0.62] saturate-[0.55]" : "bg-luc-surface-2"}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <BillLogoTile icon={bloco.icon} logoUrl={bloco.logoUrl} size={30} iconSize={16} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-luc-text">
          {bloco.nome}
        </span>
        <Link
          href={bloco.editarHref}
          aria-label={`Editar ${bloco.nome}`}
          className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-luc-md text-luc-text-3 transition-colors hover:bg-luc-surface-3 hover:text-luc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
        >
          <Pencil aria-hidden size={14} />
        </Link>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {valorNode}
        <Pill tone={leitura.tone} aria-label={leitura.aria}>
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${leitura.dot}`} />
          {leitura.label}
        </Pill>
      </div>

      <div className="mt-[5px] pb-[11px] font-mono text-[10.5px]">
        <span className={leitura.frase}>{bloco.frase}</span>
        {bloco.valor.estado === "estimativa" && (
          <span className="text-luc-faint"> · valor estimado</span>
        )}
        {bloco.valor.estado === "ausente" && (
          <span className="text-luc-faint"> · sem histórico</span>
        )}
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
 * ocorrência no mês vigente, na ordem de urgência de `derivarPanoramaMensal`
 * (#93) — vencida na frente, paga apagando no fim. O bloco expõe estado, frase
 * e valor estado-dependente em formato de varredura: valor somado quando pago,
 * `≈ média` quando em aberto com histórico, `—` sem base (CONTEXT.md: o valor
 * exato só nasce no Lançamento — nunca zero disfarçado).
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
