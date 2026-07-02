import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { auth } from "@/auth"
import { AppShell } from "@/components/shell/AppShell"
import { resolveAvatares } from "@/core/use-cases/resolve-avatares"

/**
 * Tudo sob (app) ganha a casca navegável e re-checa a sessão no servidor:
 * defesa-em-profundidade (ADR-0004). O middleware é otimização, não o único
 * portão — quem renderiza dado do Lar confirma a sessão perto do dado. As
 * Pessoas (com o avatar já resolvido, #51) alimentam os badges do header e do
 * rodapé da sidebar — sem Lar ainda (estado transitório do seed), a casca cai
 * no fallback padrão de `AppShell`.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await auth())) redirect("/login")

  const lar = await drizzleHouseholdRepo().carregarLar()
  const pessoas = lar ? await resolveAvatares(lar.pessoas, r2AttachmentStore()) : undefined

  return <AppShell pessoas={pessoas}>{children}</AppShell>
}
