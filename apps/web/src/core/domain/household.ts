/**
 * Domínio do Lar (núcleo puro — ADR-0003). Um Lar tem exatamente 2 Pessoas
 * com acesso simétrico aos mesmos dados (CONTEXT.md #1, #2). Aqui só há fatos
 * e derivações puras; nada de Drizzle, Next ou React.
 */

export type Pessoa = {
  id: string
  nome: string
  email: string
  /** Matiz HSL (0–359) que identifica a Pessoa na UI. Persistido. */
  hue: number
  /** Letra de exibição (ex.: "T", "J"). */
  inicial: string
  /** Chave do avatar no R2 (foto do Google espelhada no login); `null` sem foto. */
  avatarKey: string | null
}

export type Lar = {
  id: string
  nome: string
  pessoas: Pessoa[]
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
