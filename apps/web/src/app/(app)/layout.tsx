import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { auth } from "@/auth"
import { AppShell } from "@/components/shell/AppShell"

/**
 * Tudo sob (app) ganha a casca navegável e re-checa a sessão no servidor:
 * defesa-em-profundidade (ADR-0004). O middleware é otimização, não o único
 * portão — quem renderiza dado do Lar confirma a sessão perto do dado.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await auth())) redirect("/login")
  return <AppShell>{children}</AppShell>
}
