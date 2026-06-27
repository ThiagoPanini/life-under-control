import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core"

/**
 * Schema Drizzle do LUC. `households` e `users` são identidade/autoria
 * (ADR-0002), não autorização — esta vive na allowlist (S3). Dinheiro futuro
 * será inteiro em centavos (bigint), nunca float (CONTEXT.md #6).
 */

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
})

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  email: text("email").notNull().unique(),
  nome: text("nome").notNull(),
  hue: integer("hue").notNull(),
  inicial: text("inicial").notNull(),
})
