import { eq, sql } from "drizzle-orm"
import type { Pessoa } from "@/core/domain/household"
import type { UserRepo } from "@/core/ports/user-repo"
import { TelefoneEmConflitoError } from "@/core/use-cases/vincular-telefone"
import { type Db, getDb } from "./client"
import { users } from "./schema"

/**
 * A checagem de conflito do use-case (issue #152) lê e depois escreve em
 * passos separados — duas Pessoas submetendo o mesmo número quase ao mesmo
 * tempo podem passar ambas pela leitura antes de qualquer escrita. O índice
 * único no banco é quem de fato impede o dado duplicado; aqui só traduzimos a
 * violação numa mensagem amigável em vez de deixar o erro cru do Postgres subir.
 */
function ehConflitoDeWhatsappPhone(e: unknown): boolean {
  // O driver pg lança o erro de unicidade; o drizzle-orm o embrulha numa
  // DrizzleQueryError e preserva o original em `cause` — checa os dois.
  const causa =
    typeof e === "object" && e !== null && "cause" in e ? (e as { cause: unknown }).cause : e
  return (
    typeof causa === "object" &&
    causa !== null &&
    (causa as { code?: unknown }).code === "23505" &&
    (causa as { constraint?: unknown }).constraint === "users_whatsapp_phone_unique"
  )
}

function paraDominio(u: typeof users.$inferSelect): Pessoa {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    googleEmail: u.googleEmail,
    hue: u.hue,
    inicial: u.inicial,
    avatarKey: u.avatarKey,
    whatsappPhone: u.whatsappPhone,
  }
}

/**
 * Adapter Drizzle do `UserRepo` (ADR-0003) — a única escrita pontual em `users`
 * hoje: gravar a chave do avatar espelhado no login (#51).
 */
export function drizzleUserRepo(db: Db = getDb()): UserRepo {
  return {
    async obterPorEmail(email: string): Promise<Pessoa | null> {
      const [row] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = lower(${email})`)
      return row ? paraDominio(row) : null
    },

    async obterPorGoogleEmail(googleEmail: string): Promise<Pessoa | null> {
      const [row] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.googleEmail}) = lower(${googleEmail})`)
      return row ? paraDominio(row) : null
    },

    async definirAvatarKey(userId: string, avatarKey: string): Promise<void> {
      await db.update(users).set({ avatarKey }).where(eq(users.id, userId))
    },

    async vincularGoogleEmail(userId: string, googleEmail: string): Promise<void> {
      await db
        .update(users)
        .set({ googleEmail: googleEmail.toLowerCase() })
        .where(eq(users.id, userId))
    },

    async obterPorWhatsappPhone(whatsappPhone: string): Promise<Pessoa | null> {
      const [row] = await db.select().from(users).where(eq(users.whatsappPhone, whatsappPhone))
      return row ? paraDominio(row) : null
    },

    async vincularWhatsappPhone(userId: string, whatsappPhone: string): Promise<void> {
      try {
        await db.update(users).set({ whatsappPhone }).where(eq(users.id, userId))
      } catch (e) {
        if (ehConflitoDeWhatsappPhone(e)) throw new TelefoneEmConflitoError(whatsappPhone)
        throw e
      }
    },

    async desvincularWhatsappPhone(userId: string): Promise<void> {
      await db.update(users).set({ whatsappPhone: null }).where(eq(users.id, userId))
    },
  }
}
