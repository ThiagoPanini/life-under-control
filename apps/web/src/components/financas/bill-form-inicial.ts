import type { Bill } from "@/core/domain/bill"

/**
 * Projeção da Conta nos campos-string do formulário — **módulo puro, sem
 * `"use client"`** de propósito: o Server Component da edição chama
 * `billParaInicial(bill)` e passa o resultado pro formulário cliente. Se isto
 * morasse no módulo `"use client"` do ContaForm, todo export viraria uma
 * referência-cliente e chamar a função no servidor explodiria (RSC).
 */

/** Os campos do formulário como strings de borda (o que cada input controla). */
export type BillFormInicial = {
  nome: string
  descricao: string
  icon: string
  intervalMonths: string
  anchorMonth: string
  dueRuleKind: string
  dueRuleDay: string
  dueRuleNth: string
  dueMonthOffset: string
}

/** Estado inicial do cadastro (Conta nova): mensal, dia-fixo, sem ícone. */
export const INICIAL_PADRAO: BillFormInicial = {
  nome: "",
  descricao: "",
  icon: "",
  intervalMonths: "1",
  anchorMonth: "",
  dueRuleKind: "dia-fixo",
  dueRuleDay: "10",
  dueRuleNth: "5",
  dueMonthOffset: "0",
}

/**
 * Projeta uma Conta nos campos-string do formulário, para preencher a edição. Os
 * parâmetros que a forma corrente não usa (`dueRuleDay` num último-dia-útil) caem
 * no padrão, prontos caso a Pessoa troque de forma.
 */
export function billParaInicial(bill: Bill): BillFormInicial {
  return {
    nome: bill.nome,
    descricao: bill.descricao ?? "",
    icon: bill.icon,
    intervalMonths: String(bill.recurrence.intervalMonths),
    anchorMonth: bill.recurrence.anchorMonth ? String(bill.recurrence.anchorMonth) : "",
    dueRuleKind: bill.dueRule.kind,
    dueRuleDay:
      bill.dueRule.kind === "dia-fixo" ? String(bill.dueRule.day) : INICIAL_PADRAO.dueRuleDay,
    dueRuleNth:
      bill.dueRule.kind === "n-esimo-dia-util"
        ? String(bill.dueRule.nth)
        : INICIAL_PADRAO.dueRuleNth,
    dueMonthOffset: String(bill.dueMonthOffset),
  }
}
