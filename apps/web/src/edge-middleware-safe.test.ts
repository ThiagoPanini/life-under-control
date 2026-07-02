import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Regressão do incidente de 02/07 (#51/#68): pôr adapter Node no grafo de imports
 * que o middleware edge empacota derruba o app inteiro em runtime — "The edge
 * runtime does not support Node.js 'crypto' module" (aws-sdk do R2 puxa `crypto`;
 * Drizzle puxa `pg`). O gate (typecheck/vitest) não executa o bundle edge, então
 * guardamos por análise estática: o middleware e a config edge-safe não podem
 * tocar `@/adapters/`, e o middleware não pode importar o `@/auth` completo.
 */
const dir = fileURLToPath(new URL(".", import.meta.url))
const fonte = (rel: string): string => readFileSync(`${dir}${rel}`, "utf8")

describe("segurança do bundle edge (middleware)", () => {
  test("test_middleware_nao_importa_adapter_node", () => {
    expect(fonte("middleware.ts")).not.toMatch(/@\/adapters\//)
  })

  test("test_middleware_usa_config_edge_safe_e_nao_o_auth_completo", () => {
    const src = fonte("middleware.ts")
    expect(src).toContain("@/auth.config")
    expect(src).not.toMatch(/from ["']@\/auth["']/)
  })

  test("test_auth_config_nao_importa_adapter_node", () => {
    expect(fonte("auth.config.ts")).not.toMatch(/@\/adapters\//)
  })
})
