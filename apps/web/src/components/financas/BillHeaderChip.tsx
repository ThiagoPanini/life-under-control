import { BillIcon } from "@/components/financas/BillIcon"

/**
 * Chip 28×28 do header dos modais compactos (Final): o logo da Conta quando
 * existe, senão o ícone do catálogo, sempre no mesmo quadrado accent raio 8.
 */
export function BillHeaderChip({ icon, logoUrl }: { icon: string; logoUrl: string | null }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-luc-accent-12 text-luc-accent-bright">
      {logoUrl ? (
        // biome-ignore lint/performance/noImgElement: URL assinada volátil; sem domínio fixo pro next/image
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <BillIcon name={icon} size={15} />
      )}
    </span>
  )
}
