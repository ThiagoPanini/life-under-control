import type { Bill, DadosBill } from "../domain/bill"

/** Dados de uma Conta nova já validados, mais o dono (o Lar). */
export type NovaBill = DadosBill & { householdId: string }

/**
 * Port de persistência de Contas (ADR-0003). O núcleo depende desta interface,
 * não de Drizzle. Um adapter concreto a implementa; testes usam um fake.
 */
export type BillRepo = {
  /** Grava uma Conta nova e devolve a forma de domínio (com id e estado). */
  criarBill(nova: NovaBill): Promise<Bill>
  /** Lista as Contas de um Lar (acesso simétrico — não filtra por Pessoa, #1). */
  listarBills(householdId: string): Promise<Bill[]>
}
