import { redirect } from "next/navigation"
import { AreaCard } from "@/components/ds/AreaCard"
import { PageHeader } from "@/components/ds/PageHeader"
import { AREAS } from "@/core/domain/areas"
import { assuntoUnicoAtivo } from "@/core/domain/nav-model"
import { assuntosDaArea } from "@/core/domain/subjects"

const financas = AREAS.find((area) => area.slug === "financas")

/**
 * Raiz da Área Finanças: o mini-Painel de Assuntos (ADR-0009). A Área reúne seus
 * Assuntos como o Painel reúne as Áreas — reusa o card de Área. Config pura, sem
 * banco: o cockpit de Pagamentos Recorrentes vive um nível abaixo.
 *
 * Redirect condicional (emenda D1, 01/07/2026): com exatamente 1 Assunto ativo,
 * o mini-Painel de um item só é um hop vazio — a raiz pula direto a ele.
 */
export default function FinancasPage() {
  const unico = assuntoUnicoAtivo("financas")
  if (unico) {
    redirect(`/areas/financas/${unico.slug}`)
  }

  const assuntos = assuntosDaArea("financas")

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3.5">
        <PageHeader
          title={financas?.nome ?? "Finanças"}
          description="Cada Assunto de Finanças tem seu próprio modelo — escolha por onde entrar."
        />

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[13px] font-bold text-luc-text-strong">Assuntos</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {assuntos.map((assunto) => (
              <AreaCard
                key={assunto.slug}
                area={assunto}
                href={`/areas/financas/${assunto.slug}`}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
