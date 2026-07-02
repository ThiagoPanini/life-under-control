import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { runMigrations } from "../../../migrate.mjs"
import * as schema from "./schema"
import { households, users } from "./schema"
import { drizzleUserRepo } from "./user-repo.drizzle"

/**
 * Seam 2: o adapter Drizzle do `UserRepo` contra um Postgres real. Cria seu
 * próprio Lar + Pessoa (uuid novo) em vez de tocar o seed — `definirAvatarKey`
 * escreve de verdade, e mutar a Pessoa semeada contaminaria outros Seam 2
 * (`household-repo.drizzle.test.ts` lê o seed pristino).
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

suite("drizzleUserRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle<typeof schema>>
  let larId: string
  let pessoaId: string
  let pessoaEmail: string

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })

    const [lar] = await db.insert(households).values({ nome: "Lar de teste user-repo" }).returning()
    larId = lar.id
    pessoaEmail = `pessoa-${larId}@teste.lar`
    const [pessoa] = await db
      .insert(users)
      .values({ householdId: larId, email: pessoaEmail, nome: "Cami", hue: 90, inicial: "C" })
      .returning()
    pessoaId = pessoa.id
  })

  afterAll(async () => {
    await pool?.end()
  })

  it("test_obtem_pessoa_por_email_case_insensitive", async () => {
    const repo = drizzleUserRepo(db)

    const pessoa = await repo.obterPorEmail(pessoaEmail.toUpperCase())

    expect(pessoa?.nome).toBe("Cami")
    expect(pessoa?.avatarKey).toBeNull()
  })

  it("test_email_desconhecido_devolve_nulo", async () => {
    const repo = drizzleUserRepo(db)

    expect(await repo.obterPorEmail("ninguem@fora.lar")).toBeNull()
  })

  it("test_definir_avatar_key_grava_e_reflete_na_leitura", async () => {
    const repo = drizzleUserRepo(db)

    await repo.definirAvatarKey(pessoaId, `identity/users/${pessoaId}/avatar`)

    const depois = await repo.obterPorEmail(pessoaEmail)
    expect(depois?.avatarKey).toBe(`identity/users/${pessoaId}/avatar`)
  })
})
