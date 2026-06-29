import { centavosParaCampo } from "@/core/domain/money"
import type { Payment } from "@/core/domain/payment"

/**
 * Projeção de um Lançamento nos campos-string da baixa — **módulo puro, sem
 * `"use client"`** de propósito: o Server Component da Conta chama
 * `paymentParaInicial(payment)` e passa o resultado pro formulário cliente (a
 * mesma disciplina de `bill-form-inicial`, para a função ser chamável no servidor
 * sem virar referência-cliente).
 */

/** Os campos da baixa como strings de borda (o que cada input controla). */
export type PaymentFormInicial = {
  /** Valor em texto BR de input ("1234,56"); vazio quando não há sugestão. */
  valor: string
  /** Data civil (YYYY-MM-DD); vazio = sem data. */
  dataPagamento: string
  /** Competência `ano-mês` (YYYY-MM). */
  competencia: string
  /** Id da Pessoa que pagou. */
  paidBy: string
}

/** Projeta um Lançamento nos campos-string do formulário, para preencher a edição. */
export function paymentParaInicial(payment: Payment): PaymentFormInicial {
  return {
    valor: centavosParaCampo(payment.valor),
    dataPagamento: payment.dataPagamento ?? "",
    competencia: payment.competencia,
    paidBy: payment.paidBy,
  }
}
