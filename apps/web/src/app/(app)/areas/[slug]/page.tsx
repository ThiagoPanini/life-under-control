import { notFound } from "next/navigation"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Button } from "@/components/ds/Button"
import { Pill } from "@/components/ds/Pill"
import { AREAS } from "@/core/domain/areas"

export function generateStaticParams() {
  return AREAS.filter((area) => area.estado === "em-breve").map((area) => ({ slug: area.slug }))
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const area = AREAS.find((item) => item.slug === slug)
  if (!area || area.estado === "ativa") notFound()

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto mt-[8vh] flex max-w-[560px] flex-col items-center text-center">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] border border-luc-border bg-white/[0.04] text-luc-text-3">
          <AreaIcon name={area.icon} size={36} />
        </span>
        <Pill tone="coming-soon" className="mt-[18px] px-[11px] py-1">
          em breve
        </Pill>
        <h1 className="mt-4 text-[27px] font-extrabold tracking-[-0.02em] text-luc-text">
          {area.nome}
        </h1>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-luc-text-2">
          {area.resumo}. Esta Área ainda não foi ativada — sem métrica, sem prazo.
        </p>
        <Button href="/painel" variant="secondary" className="mt-[26px]">
          ← Voltar ao Painel
        </Button>
      </div>
    </div>
  )
}
