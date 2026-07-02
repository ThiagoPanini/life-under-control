"use client"

import { useState } from "react"
import { deletarLancamento, editarLancamento } from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { PersonChip } from "@/components/ds/PersonChip"
import { ComprovantesLancamento } from "@/components/financas/ComprovantesLancamento"
import { ConnectedPaymentForm } from "@/components/financas/ConnectedPaymentForm"
import { paymentParaInicial } from "@/components/financas/payment-form-inicial"
import type { Attachment } from "@/core/domain/attachment"
import { formatarDataBr, type Recurrence } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import { descreverCompetencia, type Payment } from "@/core/domain/payment"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

const warnCls = "border border-luc-warn/40 text-luc-warn hover:border-luc-warn hover:text-luc-warn"

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
  pessoas: PessoaComAvatar[]
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

function nomeDe(pessoas: PessoaComAvatar[], id: string): string {
  return pessoas.find((p) => p.id === id)?.nome ?? "—"
}

function pessoaDe(pessoas: PessoaComAvatar[], id: string): PessoaComAvatar | undefined {
  return pessoas.find((pessoa) => pessoa.id === id)
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
  pessoas: PessoaComAvatar[]
  recurrence: Recurrence
  comprovantes: Attachment[]
  competenciasDeOutros: string[]
}) {
  const [editando, setEditando] = useState(false)

  if (editando) {
    return (
      <li className="rounded-luc-lg border border-luc-border bg-luc-surface-2 p-5">
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
    <li className="flex flex-col gap-3 rounded-luc-lg border border-luc-border bg-luc-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[14px] font-semibold text-luc-text">
              {formatBRL(lancamento.valor)}
            </span>
            <span className="text-[11.5px] text-luc-text-2">
              {descreverCompetencia(lancamento.competencia, recurrence)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-luc-muted">
            <span className="font-mono">
              {lancamento.dataPagamento ? formatarDataBr(lancamento.dataPagamento) : "Sem data"}
            </span>
            <span className="text-luc-faint">·</span>
            {pessoaDe(pessoas, lancamento.paidBy) ? (
              <PersonChip
                pessoa={pessoaDe(pessoas, lancamento.paidBy) as PessoaComAvatar}
                compact
              />
            ) : (
              <span>Pago por {nomeDe(pessoas, lancamento.paidBy)}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => setEditando(true)}
            className="min-h-9 px-3 py-1.5 text-xs"
          >
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
      <Button
        variant="secondary"
        type="button"
        onClick={() => setArmado(true)}
        className={`${warnCls} min-h-9 px-3 py-1.5 text-xs`}
      >
        Deletar
      </Button>
    )
  }

  return (
    <form action={acao} className="inline-flex items-center gap-2">
      <Button variant="secondary" type="submit" className={warnCls}>
        Confirmar
      </Button>
      <Button variant="secondary" type="button" onClick={() => setArmado(false)}>
        Cancelar
      </Button>
    </form>
  )
}
