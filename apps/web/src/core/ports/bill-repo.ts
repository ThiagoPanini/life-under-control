import type { Bill, DadosBill } from "../domain/bill"

/** Dados de uma Conta nova já validados, mais o dono (o Lar). */
export type NovaBill = DadosBill & { householdId: string }

/**
 * Quanto a exclusão de uma Conta leva junto (invariante: deletar é destrutivo).
 * Lançamentos (#19) e Anexos (#20) cascateiam na exclusão — a contagem reflete o
 * que o `on delete cascade` apaga, para o aviso destrutivo da borda ser honesto.
 */
export type DependentesBill = { lancamentos: number; anexos: number }

/**
 * Port de persistência de Contas (ADR-0003). O núcleo depende desta interface,
 * não de Drizzle. Um adapter concreto a implementa; testes usam um fake. Toda
 * operação é escopada pelo `householdId` (o Lar logado) — uma Conta de outro Lar
 * é invisível, e ler/editar/encerrar/deletar fora do Lar devolve `null`.
 */
export type BillRepo = {
  /** Grava uma Conta nova e devolve a forma de domínio (com id e estado). */
  criarBill(nova: NovaBill): Promise<Bill>
  /** Lista as Contas de um Lar (acesso simétrico — não filtra por Pessoa, #1). */
  listarBills(householdId: string): Promise<Bill[]>
  /** Carrega uma Conta do Lar por id; `null` se não existe ou é de outro Lar. */
  obterBill(householdId: string, billId: string): Promise<Bill | null>
  /** Atualiza a *regra* de uma Conta (nunca o passado, #4); `null` se não achou. */
  editarBill(householdId: string, billId: string, dados: DadosBill): Promise<Bill | null>
  /** Encerra a Conta: grava `encerrada` + a data civil; `null` se não achou. */
  encerrarBill(householdId: string, billId: string, encerradaEm: string): Promise<Bill | null>
  /** Conta os dependentes (Lançamentos/Anexos) que a exclusão levaria junto. */
  contarDependentes(householdId: string, billId: string): Promise<DependentesBill>
  /** Apaga a Conta e seus dependentes; devolve quantos foram, ou `null` se não achou. */
  deletarBill(householdId: string, billId: string): Promise<DependentesBill | null>
}
