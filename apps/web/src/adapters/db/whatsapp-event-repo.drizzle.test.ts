import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { runMigrations } from "../../../migrate.mjs"
import * as schema from "./schema"
import { drizzleWhatsappEventRepo } from "./whatsapp-event-repo.drizzle"

/** Seam 2: o adapter Drizzle do `WhatsappEventRepo` contra um Postgres real (issue #155). */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

suite("drizzleWhatsappEventRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
  })

  afterAll(async () => {
    await pool?.end()
  })

  it("test_reivindicar_evento_novo_devolve_verdadeiro", async () => {
    const repo = drizzleWhatsappEventRepo(db)

    const reivindicado = await repo.reivindicar({
      waMessageId: `wamid.novo-${Date.now()}`,
      remetente: "+5511987654321",
    })

    expect(reivindicado).toBe(true)
  })

  it("test_reivindicar_o_mesmo_wa_message_id_duas_vezes_devolve_falso_na_segunda", async () => {
    const repo = drizzleWhatsappEventRepo(db)
    const waMessageId = `wamid.duplicado-${Date.now()}`

    const primeira = await repo.reivindicar({ waMessageId, remetente: "+5511987654321" })
    const segunda = await repo.reivindicar({ waMessageId, remetente: "+5511987654321" })

    expect(primeira).toBe(true)
    expect(segunda).toBe(false)
  })

  it("test_reivindicacao_concorrente_do_mesmo_wa_message_id_so_uma_vence", async () => {
    const repo = drizzleWhatsappEventRepo(db)
    const waMessageId = `wamid.concorrente-${Date.now()}`

    const resultados = await Promise.all([
      repo.reivindicar({ waMessageId, remetente: "+5511987654321" }),
      repo.reivindicar({ waMessageId, remetente: "+5511987654321" }),
    ])

    expect(resultados.filter(Boolean)).toHaveLength(1)
  })
})
