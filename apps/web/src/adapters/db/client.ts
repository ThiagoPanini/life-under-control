import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

export type Db = ReturnType<typeof drizzle<typeof schema>>

/**
 * Pool singleton (cacheado no globalThis para sobreviver ao hot-reload do dev).
 * A conexão nasce sob demanda; sem DATABASE_URL, falha alto e cedo.
 */
const globalForDb = globalThis as unknown as { __lucPool?: Pool }

export function getDb(): Db {
  if (!globalForDb.__lucPool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error("DATABASE_URL não definido")
    const pool = new Pool({ connectionString })
    // node-postgres emite 'error' em clients ociosos (ex.: o Postgres reciclando
    // a conexão num redeploy). Sem um listener, o Node derruba o processo; aqui
    // logamos e seguimos — o pg descarta o client quebrado e reabre sob demanda.
    pool.on("error", (err) => console.error("[db] erro em client ocioso do pool:", err))
    globalForDb.__lucPool = pool
  }
  return drizzle(globalForDb.__lucPool, { schema })
}
