import type { Pessoa } from "../domain/household"

/**
 * Port de escrita/leitura pontual de uma Pessoa (`users`, ADR-0003). Distinto do
 * `HouseholdRepo` (que só lê o Lar inteiro): este port existe para o espelhamento
 * de avatar no login, que precisa achar a Pessoa pelo e-mail da sessão e gravar
 * a chave do avatar — nenhum outro fluxo hoje escreve em `users`.
 */
export type UserRepo = {
  /** Acha a Pessoa pelo e-mail (case-insensitive), ou `null` se não houver. */
  obterPorEmail(email: string): Promise<Pessoa | null>
  /** Grava a chave do avatar já espelhado no R2. */
  definirAvatarKey(userId: string, avatarKey: string): Promise<void>
}
