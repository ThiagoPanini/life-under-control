import { readdirSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Fronteira do núcleo, mecanizada (ADR-0003): core/ só importa pra dentro —
 * nunca de adapters/, app/, components/, lib/, Next, Drizzle ou React. Este
 * teste é o gate; a regra de lint do Biome reforça no editor. A borda fala com
 * use-case; o núcleo nunca fala com o store nem com o framework.
 */

const CORE_DIR = resolve(process.cwd(), "src", "core")

const FORBIDDEN_PACKAGES = ["next", "react", "react-dom", "drizzle-orm", "pg"]

const FORBIDDEN_ALIAS = /^@\/(adapters|app|components|lib)(\/|$)/

/** Extrai os especificadores de todo import/export ... from "x" e import("x"). */
function importSpecifiers(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^;\n]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]
  const specs: string[] = []
  for (const re of patterns) {
    for (const match of source.matchAll(re)) specs.push(match[1])
  }
  return specs
}

/** Decide se um especificador, visto de `fileDir`, fura a fronteira do núcleo. */
function isForbidden(spec: string, fileDir: string): boolean {
  if (spec.startsWith(".")) {
    const resolved = resolve(fileDir, spec)
    return !resolved.startsWith(CORE_DIR)
  }
  if (spec.startsWith("@/")) return FORBIDDEN_ALIAS.test(spec)
  if (spec.startsWith("node:")) return false
  const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
  return FORBIDDEN_PACKAGES.includes(pkg)
}

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFiles(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function scanCore(): string[] {
  const violations: string[] = []
  for (const file of tsFiles(CORE_DIR)) {
    const dir = file.slice(0, file.lastIndexOf("/"))
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      if (isForbidden(spec, dir)) violations.push(`${file} → ${spec}`)
    }
  }
  return violations
}

describe("fronteira do núcleo (ADR-0003)", () => {
  it("test_detector_reconhece_import_proibido", () => {
    const domain = join(CORE_DIR, "domain")
    expect(isForbidden("next/server", domain)).toBe(true)
    expect(isForbidden("react", domain)).toBe(true)
    expect(isForbidden("drizzle-orm", domain)).toBe(true)
    expect(isForbidden("@/adapters/db", domain)).toBe(true)
    expect(isForbidden("../../adapters/db", domain)).toBe(true)
    // permitido: interno, node, libs puras
    expect(isForbidden("./money", domain)).toBe(false)
    expect(isForbidden("@/core/domain/money", domain)).toBe(false)
    expect(isForbidden("node:crypto", domain)).toBe(false)
    expect(isForbidden("vitest", domain)).toBe(false)
  })

  it("test_core_nao_importa_borda_nem_infra", () => {
    expect(scanCore()).toEqual([])
  })

  it("test_caminho_do_core_e_absoluto", () => {
    expect(isAbsolute(CORE_DIR)).toBe(true)
  })
})
