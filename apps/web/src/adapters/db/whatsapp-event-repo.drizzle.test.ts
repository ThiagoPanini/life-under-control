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

  it("test_evento_novo_ainda_nao_foi_processado", async () => {
    const repo = drizzleWhatsappEventRepo(db)

    expect(await repo.jaProcessado(`wamid.novo-${Date.now()}`)).toBe(false)
  })

  it("test_registrar_e_depois_ja_processado_e_verdadeiro", async () => {
    const repo = drizzleWhatsappEventRepo(db)
    const waMessageId = `wamid.registrado-${Date.now()}`

    await repo.registrar({ waMessageId, remetente: "+5511987654321" })

    expect(await repo.jaProcessado(waMessageId)).toBe(true)
  })

  it("test_registrar_o_mesmo_wa_message_id_duas_vezes_e_idempotente", async () => {
    const repo = drizzleWhatsappEventRepo(db)
    const waMessageId = `wamid.duplicado-${Date.now()}`

    await repo.registrar({ waMessageId, remetente: "+5511987654321" })

    await expect(
      repo.registrar({ waMessageId, remetente: "+5511987654321" }),
    ).resolves.not.toThrow()
  })

  it("test_registro_concorrente_do_mesmo_wa_message_id_nao_lanca_erro_cru", async () => {
    const repo = drizzleWhatsappEventRepo(db)
    const waMessageId = `wamid.concorrente-${Date.now()}`

    const resultados = await Promise.allSettled([
      repo.registrar({ waMessageId, remetente: "+5511987654321" }),
      repo.registrar({ waMessageId, remetente: "+5511987654321" }),
    ])

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true)
    expect(await repo.jaProcessado(waMessageId)).toBe(true)
  })
})
