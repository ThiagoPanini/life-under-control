"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useId } from "react"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { BillCard } from "@/components/financas/BillCard"
import type { Bill } from "@/core/domain/bill"

/**
 * Seção Encerradas do Assunto Pagamentos Recorrentes: colapsada por default (#49).
 * Estado do toggle mora na URL (`?encerradas=1`) — sobrevive a reload/voltar e é
 * compartilhável entre as duas Pessoas do Lar; só o BillCard some do DOM quando oculto.
 */
export function EncerradasSection({
  bills,
  logoUrls,
}: {
  bills: Bill[]
  logoUrls?: Map<string, string | null>
}) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const headingId = useId()
  const listId = useId()
  const expandida = searchParams.get("encerradas") === "1"

  if (bills.length === 0) return null

  function alternar() {
    const params = new URLSearchParams(searchParams.toString())
    if (expandida) {
      params.delete("encerradas")
    } else {
      params.set("encerradas", "1")
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <SectionHeading
        id={headingId}
        title="Encerradas"
        suffix={`· ${bills.length}`}
        actions={
          <button
            type="button"
            aria-expanded={expandida}
            aria-controls={listId}
            onClick={alternar}
            className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-luc-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"
          >
            {expandida ? "Ocultar" : "Mostrar encerradas"}
          </button>
        }
      />

      <div id={listId} hidden={!expandida} className="flex flex-col gap-3">
        {expandida &&
          bills.map((bill) => (
            <BillCard key={bill.id} bill={bill} logoUrl={logoUrls?.get(bill.id)} />
          ))}
      </div>
    </section>
  )
}
