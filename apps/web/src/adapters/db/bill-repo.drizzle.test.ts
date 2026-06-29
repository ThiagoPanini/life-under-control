import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { NovaBill } from "@/core/ports/bill-repo"
import { runMigrations } from "../../../migrate.mjs"
import { drizzleBillRepo } from "./bill-repo.drizzle"
import * as schema from "./schema"
import { households } from "./schema"

/**
 * Seam 2: o adapter Drizzle de `bills` contra um Postgres real. Confere que o
 * round-trip preserva a forma de domínio (Recorrência + união DueRule + offset
 * + estado), sem reapresentar valor (invariante #5). Cada execução cria um Lar
 * descartável (uuid novo), então rerodar não contamina as asserções.
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

describe("Seam 2 — guarda de cobertura (bills)", () => {
  it("test_database_url_presente_no_ci", () => {
    if (process.env.CI) expect(DATABASE_URL).toBeTruthy()
  })
})

/** Conta válida mínima; cada teste muta o que interessa. */
function nova(householdId: string, over: Partial<NovaBill> = {}): NovaBill {
  return {
    householdId,
    nome: "Conta",
    descricao: null,
    icon: "home",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    ...over,
  }
}

suite("drizzleBillRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle<typeof schema>>
  let larId: string

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    const [lar] = await db.insert(households).values({ nome: "Lar de teste bills" }).returning()
    larId = lar.id
  })

  afterAll(async () => {
    await pool?.end()
  })

  it("test_criar_devolve_dominio_com_id_e_estado_ativa", async () => {
    const repo = drizzleBillRepo(db)

    const bill = await repo.criarBill(nova(larId, { nome: "Condomínio", dueMonthOffset: 1 }))

    expect(bill.id).toBeTruthy()
    expect(bill.householdId).toBe(larId)
    expect(bill.estado).toBe("ativa")
    expect(bill.descricao).toBeNull()
    expect(bill.recurrence).toEqual({ intervalMonths: 1, anchorMonth: null })
    expect(bill.dueRule).toEqual({ kind: "dia-fixo", day: 10 })
    expect(bill.dueMonthOffset).toBe(1)
  })

  it("test_round_trip_preserva_n_esimo_dia_util_e_ancora", async () => {
    const repo = drizzleBillRepo(db)

    const criada = await repo.criarBill(
      nova(larId, {
        nome: "Plano de saúde",
        icon: "heart-pulse",
        descricao: "família",
        recurrence: { intervalMonths: 12, anchorMonth: 3 },
        dueRule: { kind: "n-esimo-dia-util", nth: 5 },
      }),
    )

    const lidas = await repo.listarBills(larId)
    const lida = lidas.find((b) => b.id === criada.id)

    expect(lida?.descricao).toBe("família")
    expect(lida?.recurrence).toEqual({ intervalMonths: 12, anchorMonth: 3 })
    expect(lida?.dueRule).toEqual({ kind: "n-esimo-dia-util", nth: 5 })
  })

  it("test_round_trip_preserva_ultimo_dia_util", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(
      nova(larId, { nome: "DAS", icon: "receipt", dueRule: { kind: "ultimo-dia-util" } }),
    )
    const lida = (await repo.listarBills(larId)).find((b) => b.id === criada.id)
    expect(lida?.dueRule).toEqual({ kind: "ultimo-dia-util" })
  })

  it("test_listar_traz_so_o_lar_ordenado_por_nome", async () => {
    const outroLar = (await db.insert(households).values({ nome: "Outro Lar" }).returning())[0].id
    const repo = drizzleBillRepo(db)
    await repo.criarBill(nova(outroLar, { nome: "Zeladoria do outro Lar" }))
    await repo.criarBill(nova(larId, { nome: "Internet", icon: "wifi" }))
    await repo.criarBill(nova(larId, { nome: "Luz", icon: "zap" }))

    const doLar = await repo.listarBills(larId)

    expect(doLar.every((b) => b.householdId === larId)).toBe(true)
    const nomes = doLar.map((b) => b.nome)
    expect(nomes).toContain("Internet")
    expect(nomes).toContain("Luz")
    expect(nomes).not.toContain("Zeladoria do outro Lar")
    // ordenado por nome (asc). Nomes ASCII: a ordem por byte e por locale coincidem,
    // então a asserção não depende da collation do Postgres (C vs. pt_BR).
    expect(nomes.indexOf("Internet")).toBeLessThan(nomes.indexOf("Luz"))
  })
})
