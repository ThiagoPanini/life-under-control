/** Tipos do runner de migração/seed (migrate.mjs) para uso no teste de Seam 2. */
export function runMigrations(connectionString: string, opts?: { seed?: boolean }): Promise<void>
