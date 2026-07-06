import { FileText } from "lucide-react"
import Link from "next/link"

/**
 * Botão "Nova Conta" do cabeçalho de Pagamentos Recorrentes — sempre visível
 * (independe de haver Conta), leva à jornada de cadastro (`?nova=1`, a mesma modal
 * do botão de onboarding do estado-vazio).
 *
 * Estilo deliberadamente **sutil**: em repouso é neutro (superfície + borda), sem
 * ciano de fundo; o accent só acende no hover (borda, leve fundo e ícone/rótulo em
 * ciano claro). Ícone de documento ("conta"), não o `+` genérico. Geometria e anel
 * de foco espelham o `Button` do design system para não destoar da casca.
 */
export function NovaContaButton() {
  return (
    <Link
      href="/areas/financas/pagamentos-recorrentes?nova=1"
      className="group inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-[11px] border border-luc-border-strong bg-luc-surface-2 px-4 py-2 text-[13.5px] font-semibold text-luc-text-2 transition-[color,background-color,border-color,transform] duration-150 hover:border-luc-accent hover:bg-luc-accent-12 hover:text-luc-accent-bright active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"
    >
      <FileText
        aria-hidden
        size={16}
        className="text-luc-text-3 transition-colors group-hover:text-luc-accent-bright"
      />
      Nova Conta
    </Link>
  )
}
