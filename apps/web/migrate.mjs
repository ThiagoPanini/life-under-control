// Migração + seed do LUC, em JS puro (roda no container standalone, que tem
// `pg` no node_modules traçado pelo Next). Aplica cada .sql de drizzle/ uma
// única vez (rastreado em _luc_migrations) e depois o seed idempotente.
// É também a fonte única usada pelo teste de Seam 2 (importa runMigrations).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, "drizzle")
const seedFile = join(migrationsDir, "seed.sql")

/** Conecta com retry — o Postgres pode não estar pronto no boot do deploy. */
async function connectWithRetry(connectionString, attempts = 10, delayMs = 1500) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    const client = new pg.Client({ connectionString })
    try {
      await client.connect()
      return client
    } catch (err) {
      lastErr = err
      await client.end().catch(() => {})
      console.log(`[migrate] aguardando o Postgres (tentativa ${i + 1}/${attempts})...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastErr
}

/**
 * Aplica migrações pendentes e (opcionalmente) o seed contra a `connectionString`.
 * @param {string} connectionString
 * @param {{ seed?: boolean }} [opts]
 */
export async function runMigrations(connectionString, opts = {}) {
  const { seed = true } = opts
  const client = await connectWithRetry(connectionString)
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _luc_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    )
    const { rows } = await client.query("SELECT name FROM _luc_migrations")
    const applied = new Set(rows.map((r) => r.name))

    const pendentes = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
      .sort()

    for (const file of pendentes) {
      if (applied.has(file)) continue
      const sql = readFileSync(join(migrationsDir, file), "utf8")
      await client.query("BEGIN")
      try {
        await client.query(sql)
        await client.query("INSERT INTO _luc_migrations (name) VALUES ($1)", [file])
        await client.query("COMMIT")
        console.log(`[migrate] aplicada: ${file}`)
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    }

    if (seed && existsSync(seedFile)) {
      await client.query(readFileSync(seedFile, "utf8"))
      console.log("[migrate] seed aplicado (idempotente)")
    }
  } finally {
    await client.end()
  }
}

// Execução direta (CMD do container): migra + semeia, ou pula sem DATABASE_URL.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.log("[migrate] DATABASE_URL ausente — pulando migração.")
    process.exit(0)
  }
  runMigrations(url)
    .then(() => {
      console.log("[migrate] concluído.")
      process.exit(0)
    })
    .catch((err) => {
      console.error("[migrate] falhou:", err)
      process.exit(1)
    })
}
