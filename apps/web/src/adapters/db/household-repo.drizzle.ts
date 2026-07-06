import { asc, eq } from "drizzle-orm"
import type { Lar, Pessoa } from "@/core/domain/household"
import type { HouseholdRepo } from "@/core/ports/household-repo"
import { type Db, getDb } from "./client"
import { households, users } from "./schema"

/**
 * Adapter Drizzle do `HouseholdRepo` (ADR-0003). Traduz linhas do Postgres na
 * forma de domínio. O `db` é injetável para o teste de Seam 2.
 */
export function drizzleHouseholdRepo(db: Db = getDb()): HouseholdRepo {
  return {
    async carregarLar(): Promise<Lar | null> {
      const [lar] = await db.select().from(households).limit(1)
      if (!lar) return null

      const linhas = await db
        .select()
        .from(users)
        .where(eq(users.householdId, lar.id))
        .orderBy(asc(users.nome))

      const pessoas: Pessoa[] = linhas.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        googleEmail: u.googleEmail,
        hue: u.hue,
        inicial: u.inicial,
        avatarKey: u.avatarKey,
        whatsappPhone: u.whatsappPhone,
      }))

      return { id: lar.id, nome: lar.nome, pessoas }
    },
  }
}
