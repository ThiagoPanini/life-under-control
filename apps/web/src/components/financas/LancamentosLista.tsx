"use client"

import { useState } from "react"
import { deletarLancamento, editarLancamento } from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { ComprovantesLancamento } from "@/components/financas/ComprovantesLancamento"
import { ConnectedPaymentForm } from "@/components/financas/ConnectedPaymentForm"
import { paymentParaInicial } from "@/components/financas/payment-form-inicial"
import type { Attachment } from "@/core/domain/attachment"
import { formatarDataBr, type Recurrence } from "@/core/domain/bill"
import type { Pessoa } from "@/core/domain/household"
import { formatBRL } from "@/core/domain/money"
import { descreverCompetencia, type Payment } from "@/core/domain/payment"

const warnCls = "border-luc-warn/40 text-luc-warn hover:border-luc-warn hover:text-luc-warn"

/**
 * Lista dos Lançamentos da Conta (borda fina — Seam 3). Cada linha mostra a
 * Competência (na granularidade da Recorrência), o valor, a data e quem pagou, e
 * abre — no lugar — a edição (o mesmo `ConnectedPaymentForm` da baixa) ou a
 * exclusão de dois tempos. As duas Pessoas editam e deletam (acesso simétrico, #1).
 */
export function LancamentosLista({
  billId,
  lancamentos,
  pessoas,
  recurrence,
  comprovantesPorLancamento,
}: {
  billId: string
  lancamentos: Payment[]
  pessoas: Pessoa[]
  recurrence: Recurrence
  /** Comprovantes de cada Lançamento, por id (vazio quando não há). */
  comprovantesPorLancamento: Record<string, Attachment[]>
}) {
  if (lancamentos.length === 0) {
    return (
      <p className="rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-1 p-6 text-luc-text-2 leading-relaxed">
        Nenhum Lançamento ainda. Dê a primeira baixa acima — o valor real do mês entra aqui.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {lancamentos.map((p) => (
        <LancamentoRow
          key={chaveDeLinha(p)}
          billId={billId}
          lancamento={p}
          pessoas={pessoas}
          recurrence={recurrence}
          comprovantes={comprovantesPorLancamento[p.id] ?? []}
          // Aviso de duplicidade na edição: as competências dos OUTROS Lançamentos
          // (exclui só este, por id — não some todo mês igual ao dele).
          competenciasDeOutros={lancamentos.filter((x) => x.id !== p.id).map((x) => x.competencia)}
        />
      ))}
    </ul>
  )
}

/**
 * Chave de linha que embute o conteúdo salvo: ao gravar uma edição, o detalhe
 * revalida, o conteúdo muda → a linha remonta **fechada** com os valores novos,
 * em vez de ficar presa em modo edição mostrando o que foi digitado.
 */
function chaveDeLinha(p: Payment): string {
  return `${p.id}:${p.valor}:${p.dataPagamento ?? ""}:${p.competencia}:${p.paidBy}`
}

function nomeDe(pessoas: Pessoa[], id: string): string {
  return pessoas.find((p) => p.id === id)?.nome ?? "—"
}

function LancamentoRow({
  billId,
  lancamento,
  pessoas,
  recurrence,
  comprovantes,
  competenciasDeOutros,
}: {
  billId: string
  lancamento: Payment
  pessoas: Pessoa[]
  recurrence: Recurrence
  comprovantes: Attachment[]
  competenciasDeOutros: string[]
}) {
  const [editando, setEditando] = useState(false)

  if (editando) {
    return (
      <li className="rounded-luc-lg border border-luc-border bg-luc-surface-1 p-5">
        <ConnectedPaymentForm
          action={editarLancamento.bind(null, billId, lancamento.id)}
          pessoas={pessoas}
          inicial={paymentParaInicial(lancamento)}
          competenciasComLancamento={competenciasDeOutros}
          submitLabel="Salvar"
          submittingLabel="Salvando…"
          onCancelar={() => setEditando(false)}
        />
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-3 rounded-luc-lg border border-luc-border bg-luc-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium text-luc-text">{formatBRL(lancamento.valor)}</span>
            <span className="font-mono text-[11.5px] text-luc-text-2 uppercase tracking-[0.12em]">
              {descreverCompetencia(lancamento.competencia, recurrence)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-luc-text-3 text-sm">
            <span>
              {lancamento.dataPagamento ? formatarDataBr(lancamento.dataPagamento) : "Sem data"}
            </span>
            <span className="text-luc-faint">·</span>
            <span>Pago por {nomeDe(pessoas, lancamento.paidBy)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" type="button" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <DeletarLancamento billId={billId} paymentId={lancamento.id} />
        </div>
      </div>

      <ComprovantesLancamento
        billId={billId}
        paymentId={lancamento.id}
        comprovantes={comprovantes}
      />
    </li>
  )
}

/** Exclusão de dois tempos — arma, depois confirma. */
function DeletarLancamento({ billId, paymentId }: { billId: string; paymentId: string }) {
  const [armado, setArmado] = useState(false)
  const acao = deletarLancamento.bind(null, billId, paymentId)

  if (!armado) {
    return (
      <Button variant="ghost" type="button" onClick={() => setArmado(true)} className={warnCls}>
        Deletar
      </Button>
    )
  }

  return (
    <form action={acao} className="inline-flex items-center gap-2">
      <Button variant="ghost" type="submit" className={warnCls}>
        Confirmar
      </Button>
      <Button variant="ghost" type="button" onClick={() => setArmado(false)}>
        Cancelar
      </Button>
    </form>
  )
}
