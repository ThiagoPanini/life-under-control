import type { Lar } from "../domain/household"

/**
 * Port de leitura do Lar (ADR-0003). O núcleo depende desta interface, não de
 * Drizzle. Um adapter concreto a implementa; testes usam um fake.
 */
export type HouseholdRepo = {
  /** Carrega o Lar (único) com suas Pessoas, ou `null` se ainda não há Lar. */
  carregarLar(): Promise<Lar | null>
}
