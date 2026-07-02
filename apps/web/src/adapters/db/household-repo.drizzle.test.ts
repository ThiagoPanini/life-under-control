import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { runMigrations } from "../../../migrate.mjs"
import { drizzleHouseholdRepo } from "./household-repo.drizzle"
import * as schema from "./schema"

/**
 * Seam 2: o adapter Drizzle contra um Postgres real. Migra + semeia e lê o Lar,
 * conferindo que a leitura devolve a forma de domínio. Roda no CI (service
 * container) e localmente quando DATABASE_URL aponta para um Postgres descartável.
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

// Guarda: no CI o Seam 2 NÃO pode ser pulado em silêncio (falso-verde). Se o
// Postgres do workflow sumir, isto falha-vermelho em vez de mergear sem cobertura.
describe("Seam 2 — guarda de cobertura", () => {
  it("test_database_url_presente_no_ci", () => {
    if (process.env.CI) expect(DATABASE_URL).toBeTruthy()
  })
})

suite("drizzleHouseholdRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
  })

  afterAll(async () => {
    await pool?.end()
  })

  it("test_carregar_lar_devolve_casa_panini_com_2_pessoas", async () => {
    const repo = drizzleHouseholdRepo(drizzle(pool, { schema }))

    const lar = await repo.carregarLar()

    expect(lar?.nome).toBe("Casa Panini")
    expect(lar?.pessoas).toHaveLength(2)

    const porInicial = Object.fromEntries((lar?.pessoas ?? []).map((p) => [p.inicial, p]))
    expect(porInicial.T?.nome).toBe("Thiago")
    expect(porInicial.T?.hue).toBe(211)
    expect(porInicial.T?.avatarKey).toBeNull()
    expect(porInicial.J?.nome).toBe("Jakeline")
    expect(porInicial.J?.hue).toBe(14)
    expect(porInicial.J?.avatarKey).toBeNull()
  })
})
