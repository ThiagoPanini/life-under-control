import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { auth } from "@/auth"
import { AppShell } from "@/components/shell/AppShell"
import { localAuthBypass } from "@/core/use-cases/gate"
import { type PessoaComAvatar, resolveAvatares } from "@/core/use-cases/resolve-avatares"
import { resolverUsuarioAutenticado } from "@/core/use-cases/resolve-usuario-autenticado"

/**
 * Tudo sob (app) ganha a casca navegável e re-checa a sessão no servidor:
 * defesa-em-profundidade (ADR-0004). O middleware é otimização, não o único
 * portão — quem renderiza dado do Lar confirma a sessão perto do dado. A casca
 * (rodapé da sidebar, #85) mostra a Pessoa autenticada — casada pelo e-mail da
 * sessão do Google — com avatar já resolvido (#51); sem Lar ainda (estado
 * transitório do seed), cai no fallback padrão de `AppShell`.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const bypass = localAuthBypass(
    process.env.NODE_ENV ?? "development",
    process.env.LUC_LOCAL_AUTH_BYPASS,
  )
  const session = bypass ? null : await auth()
  if (!bypass && !session) redirect("/login")

  const pessoas = await carregarPessoasComAvatar()
  const usuario = resolverUsuarioAutenticado(pessoas, session?.user?.email)

  return <AppShell usuario={usuario}>{children}</AppShell>
}

/**
 * Carrega as Pessoas com avatar pra casca — nunca deixa uma falha aqui (R2 mal
 * configurado, banco fora do ar) derrubar TODA rota autenticada com um 500; a
 * casca cai no fallback padrão de `AppShell` e o resto da página renderiza normal.
 */
async function carregarPessoasComAvatar(): Promise<PessoaComAvatar[] | undefined> {
  try {
    const lar = await drizzleHouseholdRepo().carregarLar()
    return lar ? await resolveAvatares(lar.pessoas, r2AttachmentStore()) : undefined
  } catch (err) {
    console.error("[layout] falha ao carregar Pessoas com avatar — casca cai no fallback:", err)
    return undefined
  }
}
