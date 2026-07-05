/**
 * Aplica os planos da correção de Competência (#124) pelas ports — a metade com
 * efeito do par `planejarCorrecaoConta` → aqui. O plano já é o diff exato e
 * idempotente; este use-case só o transcreve em chamadas de port, conta o que fez
 * e **recusa estado que andou** desde o dry-run (competência que não é mais a `de`
 * do plano → erro, nada de escrita parcial silenciosa). Conta `inconsistente` é
 * pulada por contrato — decidir sobre ela é do operador, não do código.
 */

import type { PlanoCorrecaoConta } from "@/core/domain/backfill-correcao"
import type { DadosBill } from "@/core/domain/bill"
import type { AttachmentRepo } from "@/core/ports/attachment-repo"
import type { BillRepo } from "@/core/ports/bill-repo"
import type { PaymentRepo } from "@/core/ports/payment-repo"

/** O que a aplicação dos planos fez, para o relatório antes/depois do `--commit`. */
export type ResultadoCorrecao = {
  contasCorrigidas: number
  contasAplicadas: number
  contasInconsistentes: number
  paymentsAtualizados: number
  anexosRenomeados: number
  billsAtualizadas: number
  encerradas: number
}

export async function aplicarCorrecaoBackfill(
  billRepo: BillRepo,
  paymentRepo: PaymentRepo,
  attachmentRepo: AttachmentRepo,
  householdId: string,
  planos: PlanoCorrecaoConta[],
): Promise<ResultadoCorrecao> {
  const resultado: ResultadoCorrecao = {
    contasCorrigidas: 0,
    contasAplicadas: 0,
    contasInconsistentes: 0,
    paymentsAtualizados: 0,
    anexosRenomeados: 0,
    billsAtualizadas: 0,
    encerradas: 0,
  }

  for (const plano of planos) {
    if (plano.situacao === "inconsistente") {
      resultado.contasInconsistentes += 1
      continue
    }
    if (plano.situacao === "corrigida") {
      resultado.contasCorrigidas += 1
      continue
    }

    // Competências: reescreve cada Lançamento com a competência-verdade, preservando
    // valor, data e autoria. `de` divergente = o banco andou desde o plano → aborta.
    const payments = await paymentRepo.listarPayments(householdId, plano.billId)
    const porId = new Map(payments.map((p) => [p.id, p]))
    for (const up of plano.paymentUpdates) {
      const atual = porId.get(up.paymentId)
      if (!atual || atual.competencia !== up.de)
        throw new Error(
          `plano desatualizado: Lançamento ${up.paymentId} não está mais em ${up.de} — refaça o dry-run`,
        )
      const editado = await paymentRepo.editarPayment(householdId, up.paymentId, {
        valor: atual.valor,
        dataPagamento: atual.dataPagamento,
        competencia: up.para,
        paidBy: atual.paidBy,
      })
      if (!editado) throw new Error(`Lançamento ${up.paymentId} sumiu ao editar — refaça o dry-run`)
      resultado.paymentsAtualizados += 1
    }

    for (const rename of plano.attachmentRenames) {
      const renomeado = await attachmentRepo.renomearAttachment(
        householdId,
        rename.attachmentId,
        rename.para,
      )
      if (!renomeado)
        throw new Error(`Anexo ${rename.attachmentId} não achado ao renomear — refaça o dry-run`)
      resultado.anexosRenomeados += 1
    }

    if (plano.billUpdate) {
      const conta = await billRepo.obterBill(householdId, plano.billId)
      if (!conta) throw new Error(`Conta ${plano.billId} não achada — refaça o dry-run`)
      const dados: DadosBill = {
        nome: conta.nome,
        descricao: conta.descricao,
        icon: conta.icon,
        recurrence: conta.recurrence,
        dueRule:
          plano.billUpdate.dueRuleDay !== undefined
            ? { kind: "dia-fixo", day: plano.billUpdate.dueRuleDay }
            : conta.dueRule,
        dueMonthOffset: plano.billUpdate.dueMonthOffset ?? conta.dueMonthOffset,
        primeiraCompetencia: plano.billUpdate.primeiraCompetencia ?? conta.primeiraCompetencia,
      }
      const editada = await billRepo.editarBill(householdId, plano.billId, dados)
      if (!editada) throw new Error(`Conta ${plano.billId} sumiu ao editar — refaça o dry-run`)
      resultado.billsAtualizadas += 1
    }

    if (plano.encerramento) {
      const encerrada = await billRepo.encerrarBill(
        householdId,
        plano.billId,
        plano.encerramento.encerradaEm,
      )
      if (!encerrada)
        throw new Error(`Conta ${plano.billId} não estava ativa ao encerrar — refaça o dry-run`)
      resultado.encerradas += 1
    }

    resultado.contasAplicadas += 1
  }

  return resultado
}
