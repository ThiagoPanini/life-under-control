import { eq, sql } from "drizzle-orm"
import type { Pessoa } from "@/core/domain/household"
import type { UserRepo } from "@/core/ports/user-repo"
import { type Db, getDb } from "./client"
import { users } from "./schema"

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
      await db.update(users).set({ whatsappPhone }).where(eq(users.id, userId))
    },

    async desvincularWhatsappPhone(userId: string): Promise<void> {
      await db.update(users).set({ whatsappPhone: null }).where(eq(users.id, userId))
    },
  }
}
