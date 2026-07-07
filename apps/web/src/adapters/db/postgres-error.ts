/**
 * Tradução de erros do driver Postgres (ADR-0003) — evita duplicar em cada
 * adapter a mesma checagem de violação de unicidade (#152, #155).
 */

/**
 * `true` se `e` é uma violação de unique constraint (23505) da constraint
 * nomeada. O driver `pg` lança o erro cru; o drizzle-orm o embrulha numa
 * `DrizzleQueryError` e preserva o original em `cause` — checa os dois.
 */
export function ehViolacaoDeUnicidade(e: unknown, constraint: string): boolean {
  const causa =
    typeof e === "object" && e !== null && "cause" in e ? (e as { cause: unknown }).cause : e
  return (
    typeof causa === "object" &&
    causa !== null &&
    (causa as { code?: unknown }).code === "23505" &&
    (causa as { constraint?: unknown }).constraint === constraint
  )
}
