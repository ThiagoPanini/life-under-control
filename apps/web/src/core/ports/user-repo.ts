import type { Pessoa } from "../domain/household"

/**
 * Port de escrita/leitura pontual de uma Pessoa (`users`, ADR-0003). Distinto do
 * `HouseholdRepo` (que só lê o Lar inteiro): serve ao espelhamento de avatar e à
 * resolução/gravação do vínculo Google (issue #94) — os fluxos que precisam achar
 * uma Pessoa pela identidade e escrever pontualmente em `users`.
 */
export type UserRepo = {
  /** Acha a Pessoa pelo e-mail nominal semeado (case-insensitive), ou `null`. */
  obterPorEmail(email: string): Promise<Pessoa | null>
  /** Acha a Pessoa pelo e-mail Google vinculado (case-insensitive), ou `null`. */
  obterPorGoogleEmail(googleEmail: string): Promise<Pessoa | null>
  /** Grava a chave do avatar já espelhado no R2. */
  definirAvatarKey(userId: string, avatarKey: string): Promise<void>
  /** Grava o e-mail Google vinculado da Pessoa (já normalizado em minúsculas). */
  vincularGoogleEmail(userId: string, googleEmail: string): Promise<void>
  /** Acha a Pessoa pelo WhatsApp (E.164) vinculado, ou `null`. */
  obterPorWhatsappPhone(whatsappPhone: string): Promise<Pessoa | null>
  /** Grava o WhatsApp (E.164) vinculado da Pessoa. */
  vincularWhatsappPhone(userId: string, whatsappPhone: string): Promise<void>
  /** Remove o WhatsApp vinculado da Pessoa (volta a `null`). */
  desvincularWhatsappPhone(userId: string): Promise<void>
}
