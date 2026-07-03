import Link from "next/link"
import { diaDaSemanaAbreviado, formatarDataBr } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { ItemAgendaView } from "@/core/use-cases/derive-agenda"
import type { FarolEstado } from "@/core/use-cases/derive-bill-card"

/**
 * Uma linha da Agenda (issue #60): a projeção clicável de uma ocorrência não
 * paga. O CTA (a linha) abre a baixa já na Competência certa (#63); "Ver
 * Conta" — um link à parte, nunca aninhado — só abre o detalhe.
 */

const FAROL_DOT: Record<FarolEstado, string> = {
  vermelho: "bg-luc-warn ring-2 ring-luc-warn/25",
  amarelo: "border-2 border-luc-warn bg-transparent",
  cinza: "bg-luc-text-3",
  verde: "bg-luc-success",
}

export function LinhaAgenda({ item }: { item: ItemAgendaView }) {
  const hrefRegistro = `/areas/financas/pagamentos-recorrentes/${item.geradorId}?registrar=1&competencia=${item.competencia}`
  const hrefConta = `/areas/financas/pagamentos-recorrentes/${item.geradorId}`

  return (
    <li className="border-luc-row-line border-t first:border-t-0">
      <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-[18px]">
        <Link
          href={hrefRegistro}
          className="flex min-w-0 flex-1 flex-col gap-2 outline-none focus-visible:ring-2 focus-visible:ring-luc-accent sm:flex-row sm:items-center sm:gap-3"
        >
          <div className="w-[76px] shrink-0">
            <time
              dateTime={item.vencimento}
              className="block font-mono text-[12.5px] text-luc-text-2"
            >
              {formatarDataBr(item.vencimento)}
            </time>
            <div className="text-[10.5px] text-luc-muted">
              {diaDaSemanaAbreviado(item.vencimento)}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${FAROL_DOT[item.farol]}`}
              />
              <span className="truncate text-sm font-semibold text-luc-text">{item.titulo}</span>
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-luc-muted">
              Conta · {item.assunto}
            </div>
            <div className="mt-0.5 text-[11.5px] text-luc-text-2">{item.frase}</div>
          </div>
          <div className="shrink-0 sm:text-right">
            {item.valorEstimado == null ? (
              <span className="text-[12px] text-luc-text-3">sem histórico</span>
            ) : (
              <>
                <div className="font-mono text-[13.5px] font-semibold text-luc-text-strong">
                  ~{formatBRL(item.valorEstimado)}
                </div>
                <div className="text-[10px] text-luc-text-3">estimativa</div>
              </>
            )}
          </div>
        </Link>
        <Link
          href={hrefConta}
          className="self-start text-[12px] font-semibold text-luc-text-2 hover:text-luc-text sm:self-auto"
        >
          Ver Conta →
        </Link>
      </div>
    </li>
  )
}
