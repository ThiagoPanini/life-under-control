import { notFound } from "next/navigation"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Button } from "@/components/ds/Button"
import { Pill } from "@/components/ds/Pill"
import { AREAS } from "@/core/domain/areas"

export function generateStaticParams() {
  return AREAS.map((area) => ({ slug: area.slug }))
}

/** View genérica e honesta de "em breve" para qualquer Área ainda não construída. */
export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const area = AREAS.find((a) => a.slug === slug)
  if (!area) notFound()

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-luc-lg border border-luc-border bg-luc-surface-2 text-luc-text-2">
          <AreaIcon name={area.icon} size={28} />
        </span>
        <div className="flex items-center gap-3">
          <h1 className="font-extrabold text-3xl text-luc-text tracking-[-0.035em] sm:text-4xl">
            {area.nome}
          </h1>
          {area.estado === "em-breve" && <Pill tone="muted">em breve</Pill>}
        </div>
        <p className="max-w-prose text-luc-text-2 leading-relaxed">
          Esta Área ainda não foi construída. Em breve ela ganha vida aqui — por enquanto, é só a
          casca.
        </p>
        <Button href="/painel" variant="ghost">
          ← Voltar ao Painel
        </Button>
      </div>
    </div>
  )
}
