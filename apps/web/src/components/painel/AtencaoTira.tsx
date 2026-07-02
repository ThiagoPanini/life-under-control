import Link from "next/link"
import { Surface } from "@/components/ds/Surface"
import { formatBRL } from "@/core/domain/money"
import type { TiraAtencao } from "@/core/use-cases/derive-atencao"

/**
 * Tira "pede atenção" do Painel (issue #47) — forward, cross-Área. CTAs honestas:
 * "Dar baixa" abre a baixa já na ocorrência certa (#63); "Ver Conta" só abre o
 * detalhe. Nenhum CTA anuncia ação que não inicia.
 */

const FAROL_DOT: Record<"amarelo" | "vermelho", { dot: string; aria: string }> = {
  amarelo: { dot: "border-2 border-luc-warn bg-transparent", aria: "vence em até 3 dias" },
  vermelho: { dot: "bg-luc-warn ring-2 ring-luc-warn/25", aria: "vence hoje ou está atrasada" },
}

export function AtencaoTira({
  tira,
  hrefConta,
  hrefBaixa,
}: {
  tira: TiraAtencao
  hrefConta: (contaId: string) => string
  hrefBaixa: (contaId: string, competencia: string) => string
}) {
  if (tira.estado === "calma") {
    return (
      <Surface className="flex items-center gap-3 p-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-luc-success" aria-hidden />
        <div>
          <div className="text-[14px] font-bold text-luc-text">Tudo em dia</div>
          <div className="text-xs text-luc-text-3">Nenhuma Conta pede atenção agora.</div>
        </div>
      </Surface>
    )
  }

  return (
    <Surface className="border-luc-warn/25 bg-luc-warn/[0.04] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold text-luc-text-strong">
          Pede atenção · {tira.itens.length}
        </h2>
        {tira.totalEstimado != null && (
          <span className="text-xs text-luc-text-3">
            ~{formatBRL(tira.totalEstimado)} pedem atenção agora
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {tira.itens.map((item) => (
          <li
            key={item.contaId}
            className="flex flex-wrap items-center gap-3 rounded-[11px] border border-luc-border bg-luc-surface-2 p-3"
          >
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${FAROL_DOT[item.farol].dot}`}
              role="img"
              aria-label={FAROL_DOT[item.farol].aria}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-luc-text">
                {item.titulo} — {item.frase}
              </div>
              <div className="text-xs text-luc-text-3">{item.detalhe}</div>
              <div className="mt-0.5 text-[11px] text-luc-faint">{item.origem}</div>
            </div>
            {item.valorEstimado != null && (
              <div className="text-right">
                <div className="text-[13.5px] font-bold text-luc-text">
                  ~{formatBRL(item.valorEstimado)}
                </div>
                <div className="text-[10.5px] text-luc-text-3">estimativa</div>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-3">
              <Link
                href={hrefBaixa(item.contaId, item.competencia)}
                className="text-[12.5px] font-semibold text-luc-accent hover:text-luc-accent-bright"
              >
                Dar baixa →
              </Link>
              <Link
                href={hrefConta(item.contaId)}
                className="text-[12.5px] font-semibold text-luc-text-2 hover:text-luc-text"
              >
                Ver Conta →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Surface>
  )
}
