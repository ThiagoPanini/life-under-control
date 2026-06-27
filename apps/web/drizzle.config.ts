import { defineConfig } from "drizzle-kit"

/** Config do drizzle-kit. `generate` lê o schema e emite SQL em ./drizzle. */
export default defineConfig({
  schema: "./src/adapters/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
})
