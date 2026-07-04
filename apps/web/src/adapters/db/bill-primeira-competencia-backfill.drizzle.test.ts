import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { runMigrations } from "../../../migrate.mjs"
import * as schema from "./schema"
import { households, users } from "./schema"

/**
 * Seam 2 — o **backfill da primeira Competência** (migração 0008, #102) contra um
 * Postgres real, executando os STATEMENTS REAIS da migração — não uma reimplementação.
 * A 0008 já rodou no `bills` vazio (o `SET NOT NULL`/CHECK são exercitados aí); para
 * exercitar o *backfill* sobre linhas, cada cenário roda numa transação que dá
 * `DROP NOT NULL` (DDL transacional, isolado dos workers concorrentes por MVCC),
 * semeia Contas com `primeira_competencia` NULL + Lançamentos, aplica os `UPDATE`s
 * lidos verbatim do arquivo 0008 e faz `ROLLBACK` — assim um erro lógico no backfill
 * real é pego, sem drift entre teste e migração.
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

// Guarda: DB indisponível é vermelho no CI, nunca um skip silencioso (falso-verde).
describe("Seam 2 — guarda de cobertura (backfill primeira Competência)", () => {
  it("test_database_url_presente_no_ci", () => {
    if (process.env.CI) expect(DATABASE_URL).toBeTruthy()
  })
})

// Os UPDATEs de backfill da migração 0008, lidos VERBATIM do arquivo (sem reimplementar):
// splitamos nos breakpoints e ficamos só com os statements de backfill (UPDATE).
const here = dirname(fileURLToPath(import.meta.url))
const SQL_0008 = readFileSync(
  join(here, "../../../drizzle/0008_add_bill_primeira_competencia.sql"),
  "utf8",
)
const UPDATES_BACKFILL = SQL_0008.split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.toUpperCase().startsWith("UPDATE"))

suite("backfill de primeira_competencia (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let larId: string
  let userId: string

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    const db = drizzle(pool, { schema })
    const [lar] = await db.insert(households).values({ nome: "Lar backfill" }).returning()
    larId = lar.id
    const [user] = await db
      .insert(users)
      .values({
        householdId: larId,
        email: `backfill-${larId}@luc.test`,
        nome: "P",
        hue: 200,
        inicial: "P",
      })
      .returning()
    userId = user.id
  })

  afterAll(async () => {
    await pool?.end()
  })

  /** Insere uma Conta com `primeira_competencia` NULL (ativa ou encerrada) e devolve o id. */
  async function semearConta(
    client: PoolClient,
    estado: "ativa" | "encerrada",
    competencias: string[],
  ): Promise<string> {
    const encerradaEm = estado === "encerrada" ? "2026-06-20" : null
    const { rows } = await client.query(
      `INSERT INTO bills (household_id, nome, icon, interval_months, due_rule_kind, due_rule_day, estado, encerrada_em, primeira_competencia)
       VALUES ($1, 'Conta', 'home', 1, 'dia-fixo', 10, $2, $3, NULL) RETURNING id`,
      [larId, estado, encerradaEm],
    )
    const billId = rows[0].id
    for (const competencia of competencias) {
      await client.query(
        `INSERT INTO payments (household_id, bill_id, valor, competencia, paid_by)
         VALUES ($1, $2, 10000, $3, $4)`,
        [larId, billId, competencia, userId],
      )
    }
    return billId
  }

  /**
   * Roda os cenários dentro de uma transação: DROP NOT NULL → semeia Contas NULL →
   * aplica os UPDATEs reais da 0008 → devolve o valor gravado de cada Conta e a
   * Competência corrente calculada pelo próprio Postgres — tudo desfeito no ROLLBACK.
   */
  async function comBackfillReal(): Promise<{
    valores: Record<string, string>
    corrente: string
  }> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("ALTER TABLE bills ALTER COLUMN primeira_competencia DROP NOT NULL")

      const ids = {
        ativaComHistorico: await semearConta(client, "ativa", ["2025-07", "2025-03", "2025-11"]),
        encerradaComHistorico: await semearConta(client, "encerrada", ["2024-12", "2025-06"]),
        ativaSemHistorico: await semearConta(client, "ativa", []),
        encerradaSemHistorico: await semearConta(client, "encerrada", []),
        splits: await semearConta(client, "ativa", ["2025-05", "2025-05", "2025-02"]),
      }

      for (const sql of UPDATES_BACKFILL) await client.query(sql)

      const { rows: correnteRows } = await client.query(
        "SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS c",
      )
      const valores: Record<string, string> = {}
      for (const [chave, id] of Object.entries(ids)) {
        const { rows } = await client.query(
          "SELECT primeira_competencia AS pc FROM bills WHERE id = $1",
          [id],
        )
        valores[chave] = rows[0].pc
      }
      return { valores, corrente: correnteRows[0].c }
    } finally {
      await client.query("ROLLBACK")
      client.release()
    }
  }

  it("test_backfill_real_da_migracao_preenche_os_quatro_cenarios", async () => {
    expect(UPDATES_BACKFILL).toHaveLength(2) // as duas fases de UPDATE da 0008
    const { valores, corrente } = await comBackfillReal()
    // Com histórico (ativa ou encerrada): a MENOR Competência de Lançamento.
    expect(valores.ativaComHistorico).toBe("2025-03")
    expect(valores.encerradaComHistorico).toBe("2024-12")
    // Sem histórico (ativa ou encerrada): a Competência corrente da migração.
    expect(valores.ativaSemHistorico).toBe(corrente)
    expect(valores.encerradaSemHistorico).toBe(corrente)
    // Splits na mesma Competência não distorcem o mínimo.
    expect(valores.splits).toBe("2025-02")
  })

  it("test_apos_migracao_a_coluna_e_not_null_e_validada", async () => {
    // A coluna final (fora de qualquer transação de teste) é NOT NULL com check de
    // formato — inserir com formato torto é rejeitado pelo banco (fato íntegro).
    await expect(
      pool.query(
        `INSERT INTO bills (household_id, nome, icon, interval_months, due_rule_kind, due_rule_day, primeira_competencia)
         VALUES ($1, 'X', 'home', 1, 'dia-fixo', 10, '2025-13')`,
        [larId],
      ),
    ).rejects.toThrow()
  })
})
