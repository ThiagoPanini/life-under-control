import type { ReactNode } from "react"
import { AppShell } from "@/components/shell/AppShell"

/** Tudo sob (app) ganha a casca navegável (sidebar + conteúdo). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
