import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { Logo } from "@/components/brand/Logo"
import { PersonChip } from "@/components/PersonChip"
import { getPainel } from "@/core/use-cases/get-painel"

// Lê o banco a cada request: nada de prerender estático no build (sem DB lá).
export const dynamic = "force-dynamic"

export default async function PainelPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())

  return (
    <main
      className="min-h-dvh px-6 py-10 sm:px-10"
      style={{
        background:
          "radial-gradient(100% 45% at 82% -8%, rgba(76,196,230,.06), transparent 60%), var(--luc-bg)",
      }}
    >
      <header className="mb-12 flex items-center gap-2.5">
        <Logo size={26} />
        <span className="font-semibold tracking-[-0.02em] text-luc-text">Life Under Control</span>
      </header>

      <section className="mx-auto flex max-w-2xl flex-col gap-5">
        <p className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-luc-accent">Lar</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-luc-text sm:text-4xl">
          {lar.nome}
        </h1>
        <div className="mt-2 flex flex-wrap gap-3">
          {lar.pessoas.map((pessoa) => (
            <PersonChip key={pessoa.id} pessoa={pessoa} />
          ))}
        </div>
      </section>
    </main>
  )
}
