"use client"

import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ds/Button"
import { PersonChip } from "@/components/ds/PersonChip"
import { Sparkline } from "@/components/ds/Sparkline"
import { BillLogoTile } from "@/components/financas/BillLogoTile"
import { type Bill, descreverVencimento, formatarDataBr } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import { descreverCompetencia, type Payment } from "@/core/domain/payment"
import type { FarolEstado, GridEstado } from "@/core/use-cases/derive-bill-card"
import type { LinhaConta as LinhaContaModel } from "@/core/use-cases/derive-linha-conta"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

/** Aresta à esquerda da linha: tint sutil só na vermelha (a mais urgente). */
const FAROL_ARESTA: Record<FarolEstado, string> = {
  vermelho: "border-l-luc-warn bg-luc-warn/[0.03]",
  amarelo: "border-l-luc-warn",
  cinza: "border-l-luc-border",
  verde: "border-l-luc-success",
}

const FAROL_DOT: Record<FarolEstado, string> = {
  vermelho: "bg-luc-warn ring-2 ring-luc-warn/25",
  amarelo: "border-2 border-luc-warn bg-transparent",
  cinza: "bg-luc-text-3",
  verde: "bg-luc-success",
}

const GRID_ESTADO: Record<GridEstado, { label: string; className: string }> = {
  "em-dia": { label: "em dia", className: "bg-luc-success" },
  "atraso-leve": { label: "atraso leve", className: "bg-luc-warn/60" },
  atraso: { label: "atraso", className: "bg-luc-warn ring-1 ring-luc-warn/30" },
  "em-aberto": { label: "em aberto", className: "border-2 border-luc-warn bg-transparent" },
  aguardando: { label: "aguardando", className: "border border-luc-border bg-white/[0.06]" },
  "pago-sem-data": { label: "pago sem data", className: "bg-luc-disabled" },
  "fora-vigencia": {
    label: "fora da vigência",
    className: "border border-luc-border/50 bg-transparent",
  },
}

function competenciaAcessivel(competencia: string) {
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`
}

function ultimosLancamentos(payments: Payment[]): Payment[] {
  return [...payments]
    .sort((a, b) =>
      `${b.competencia}:${b.dataPagamento ?? ""}`.localeCompare(
        `${a.competencia}:${a.dataPagamento ?? ""}`,
      ),
    )
    .slice(0, 3)
}

function pessoaDe(pessoas: PessoaComAvatar[], id: string): PessoaComAvatar | undefined {
  return pessoas.find((pessoa) => pessoa.id === id)
}

/**
 * A linha híbrida expansível de uma Conta ativa (issue #56): a linha É a
 * varredura densa (farol, frase de urgência #62, grid #21, valor
 * estado-dependente); a expansão inline É a profundidade que os cards
 * davam. Expansão é *sibling* do cabeçalho clicável (não descendente) — as
 * ações internas ("Ver Conta"/"Registrar pagamento") nunca disparam o toggle porque não
 * há handler de clique nesse ramo da árvore pra elas borbulharem até.
 */
export function LinhaConta({
  bill,
  linha,
  logoUrl = null,
  pessoas,
  lancamentos,
}: {
  bill: Bill
  linha: LinhaContaModel
  logoUrl?: string | null
  pessoas: PessoaComAvatar[]
  lancamentos: Payment[]
}) {
  const [aberto, setAberto] = useState(false)
  const painelId = `linha-conta-${bill.id}-expansao`

  const valorNode =
    linha.valor.estado === "real" ? (
      <span className="font-mono text-[13px] font-semibold text-luc-text-strong">
        {formatBRL(linha.valor.valor)}
      </span>
    ) : (
      <div>
        <span className="font-mono text-[13px] font-semibold text-luc-text-strong">
          {linha.valor.media == null ? "—" : `~${formatBRL(linha.valor.media)}`}
        </span>
        <span className="block text-[10px] text-luc-muted">média 12</span>
      </div>
    )

  const gridCells = linha.grid.map((celula) => {
    const estado = GRID_ESTADO[celula.estado]
    return (
      <span
        role="img"
        key={celula.competencia}
        data-testid="grid-cell"
        data-estado={celula.estado}
        aria-label={`${competenciaAcessivel(celula.competencia)}: ${estado.label}`}
        title={`${competenciaAcessivel(celula.competencia)} · ${estado.label}`}
        className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${estado.className}`}
      />
    )
  })

  const valoresPagos = linha.grid
    .map((celula) => celula.valor)
    .filter((valor): valor is number => valor != null)

  const ultimos = ultimosLancamentos(lancamentos)
  const verContaHref = `/areas/financas/pagamentos-recorrentes/${bill.id}`
  const registrarHref = `/areas/financas/pagamentos-recorrentes/${bill.id}?registrar=1&competencia=${linha.competenciaVigente}`

  return (
    <li
      data-testid="linha-conta"
      className={`rounded-luc-lg border border-luc-border border-l-[3px] bg-luc-surface-2 ${FAROL_ARESTA[linha.farol]}`}
    >
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        onClick={() => setAberto((atual) => !atual)}
        className="flex w-full flex-col gap-2 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-inset sm:flex-row sm:items-center sm:gap-4 sm:p-4"
      >
        <div className="flex items-center gap-3 sm:contents">
          <BillLogoTile icon={bill.icon} logoUrl={logoUrl} size={36} iconSize={18} />
          <div className="min-w-0 flex-1 sm:order-1 sm:w-[190px] sm:flex-none">
            <div className="truncate text-[13.5px] font-bold text-luc-text">{bill.nome}</div>
            <div className="truncate text-[11px] text-luc-muted">
              {bill.descricao && `${bill.descricao} · `}
              <span className="font-mono">
                {descreverVencimento(bill.dueRule, bill.dueMonthOffset)}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right sm:order-4 sm:w-[92px]">{valorNode}</div>
        </div>

        <div className="flex items-center gap-1.5 sm:order-2 sm:w-[150px] sm:flex-none">
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${FAROL_DOT[linha.farol]}`} />
          <span className="min-w-0 flex-1 truncate text-[12px] text-luc-text-2">{linha.frase}</span>
        </div>

        <div className="flex items-center justify-between gap-[3px] sm:order-3 sm:flex-1 sm:justify-start sm:gap-[6px]">
          {gridCells}
        </div>

        <ChevronRight
          aria-hidden
          size={16}
          className={`hidden shrink-0 text-luc-muted transition-transform duration-150 sm:order-5 sm:block ${aberto ? "rotate-90" : ""}`}
        />
      </button>

      {aberto && (
        <div id={painelId} className="border-luc-row-line border-t p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
            <div className="flex-1">
              <h4 className="text-[11px] font-semibold text-luc-text-3">
                Valores · 12 competências
              </h4>
              <div className="mt-1">
                <Sparkline values={valoresPagos} label="Histórico de valores pagos" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-luc-muted">
                <span>
                  Média 12:{" "}
                  <span className="font-mono text-luc-text-2">
                    {linha.media == null ? "—" : formatBRL(linha.media)}
                  </span>
                </span>
                <span>
                  Pontualidade:{" "}
                  <span className="font-mono text-luc-text-2">
                    {linha.pontualidade.estado === "calculada"
                      ? `${linha.pontualidade.percentual}% em dia`
                      : "sem histórico"}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex-1">
              <h4 className="text-[11px] font-semibold text-luc-text-3">Últimos Lançamentos</h4>
              {ultimos.length === 0 ? (
                <p className="mt-1 text-[11.5px] text-luc-muted">Nenhum Lançamento ainda.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {ultimos.map((lancamento) => {
                    const pessoa = pessoaDe(pessoas, lancamento.paidBy)
                    return (
                      <li
                        key={lancamento.id}
                        className="flex items-center justify-between gap-2 text-[11.5px]"
                      >
                        <span className="flex items-center gap-2 text-luc-text-2">
                          <span className="font-mono">
                            {lancamento.dataPagamento
                              ? formatarDataBr(lancamento.dataPagamento)
                              : "Sem data"}
                          </span>
                          <span className="text-luc-faint">
                            {descreverCompetencia(lancamento.competencia, bill.recurrence)}
                          </span>
                        </span>
                        {pessoa && <PersonChip pessoa={pessoa} compact />}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button href={verContaHref} variant="secondary" className="min-h-9 px-3 py-1.5 text-xs">
              Ver Conta
            </Button>
            <Button href={registrarHref} variant="primary" className="min-h-9 px-3 py-1.5 text-xs">
              Registrar pagamento
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
