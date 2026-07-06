import { auth } from "@/auth"
import type { Pessoa } from "@/core/domain/household"
import { localAuthBypass } from "@/core/use-cases/gate"
import { resolverUsuarioAutenticado } from "@/core/use-cases/resolve-usuario-autenticado"

/**
 * A Pessoa logada, resolvida do jeito único da casca (issue #94): casa pelo
 * e-mail Google vinculado, nunca pela posição na allowlist. Wraps o par
 * `auth()` + bypass local — a borda (Server Component ou Server Action) só
 * fornece as Pessoas do Lar já carregadas.
 */
export async function pessoaLogada(pessoas: Pessoa[]): Promise<Pessoa | undefined> {
  const bypass = localAuthBypass(
    process.env.NODE_ENV ?? "development",
    process.env.LUC_LOCAL_AUTH_BYPASS,
  )
  const email = bypass ? undefined : (await auth())?.user?.email
  return resolverUsuarioAutenticado(pessoas, email, bypass)
}
