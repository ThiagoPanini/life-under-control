import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { AreaCard } from "@/components/ds/AreaCard"
import { PersonChip } from "@/components/PersonChip"
import { AREAS } from "@/core/domain/areas"
import { getPainel } from "@/core/use-cases/get-painel"

// Lê o banco a cada request: nada de prerender estático no build (sem DB lá).
export const dynamic = "force-dynamic"

export default async function PainelPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())

  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-9 sm:gap-12">
        <header className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <p className="font-mono text-[11.5px] text-luc-accent uppercase tracking-[0.18em]">Lar</p>
          <h1 className="break-words font-extrabold text-3xl text-luc-text tracking-[-0.035em] sm:text-4xl">
            {lar.nome}
          </h1>
          <div className="flex flex-wrap gap-2.5 sm:gap-3">
            {lar.pessoas.map((pessoa) => (
              <PersonChip key={pessoa.id} pessoa={pessoa} />
            ))}
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <p className="font-mono text-[11.5px] text-luc-text-3 uppercase tracking-[0.18em]">
            Áreas
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {AREAS.map((area) => (
              <AreaCard key={area.slug} area={area} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
