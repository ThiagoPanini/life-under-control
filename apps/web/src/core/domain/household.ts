/**
 * Domínio do Lar (núcleo puro — ADR-0003). Um Lar tem exatamente 2 Pessoas
 * com acesso simétrico aos mesmos dados (CONTEXT.md #1, #2). Aqui só há fatos
 * e derivações puras; nada de Drizzle, Next ou React.
 */

export type Pessoa = {
  id: string
  nome: string
  /** E-mail nominal do Lar (seed). NÃO é a chave de autenticação — veja `googleEmail`. */
  email: string
  /**
   * E-mail Google vinculado (issue #94), chave de autenticação/autoria. `null`
   * enquanto o vínculo auditável (ADR-0004: e-mail da allowlist) não foi aplicado.
   * Separado de `email` de propósito: o seed é fictício; só o `googleEmail` casa
   * com a sessão real. Nunca inferir a Pessoa pela posição na allowlist (ADR-0002).
   */
  googleEmail: string | null
  /** Matiz HSL (0–359) que identifica a Pessoa na UI. Persistido. */
  hue: number
  /** Letra de exibição (ex.: "T", "J"). */
  inicial: string
  /** Chave do avatar no R2 (foto do Google espelhada no login); `null` sem foto. */
  avatarKey: string | null
  /**
   * WhatsApp vinculado (E.164, issue #152) — a allowlist da borda de ingestão
   * (ADR-0012). Opcional (não `| null` obrigatório como `googleEmail`) pra não
   * exigir o campo em todo fixture de `Pessoa` já existente; ausente equivale
   * a não vinculado.
   */
  whatsappPhone?: string | null
  /**
   * O Lar a que a Pessoa pertence (escopo de todo dado, #1). Opcional (como
   * `whatsappPhone`) pra não exigir o campo em todo fixture já existente; o
   * adapter Drizzle sempre o preenche a partir da linha. A borda de ingestão do
   * WhatsApp (#158) usa isto pra escopar Contas/Lançamentos/Propostas.
   */
  householdId?: string
}

export type Lar = {
  id: string
  nome: string
  pessoas: Pessoa[]
}

/** A Pessoa alvo não pertence ao Lar informado — invariante compartilhada por todo vínculo (Google, WhatsApp). */
export class PessoaForaDoLarError extends Error {
  constructor(pessoaId: string) {
    super(`A Pessoa ${pessoaId} não pertence ao Lar`)
    this.name = "PessoaForaDoLarError"
  }
}

/** Par de cores (texto/fundo) da Pessoa, derivado do hue no padrão do sistema de design. */
export type CoresPessoa = { fg: string; bg: string }

/** Deriva as cores da Pessoa a partir do hue (fato → interpretação). */
export function coresPessoa(hue: number): CoresPessoa {
  return {
    fg: `hsl(${hue} 76% 74%)`,
    bg: `hsl(${hue} 44% 23%)`,
  }
}

/**
 * Deriva a chave do avatar de uma Pessoa no bucket R2: `identity/users/{id}/avatar`.
 * Namespace `identity` (não uma Área, ADR-0006): a Pessoa é identidade cross-Área.
 * Uma chave fixa por Pessoa — reenviar sobrescreve (idempotente, mesmo padrão do
 * comprovante — `chaveComprovante`).
 */
export function chaveAvatar(userId: string): string {
  return `identity/users/${userId}/avatar`
}
