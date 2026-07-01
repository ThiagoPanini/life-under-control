import { notFound } from "next/navigation"
import { AreaIcon } from "@/components/areas/AreaIcon"
import { Button } from "@/components/ds/Button"
import { Pill } from "@/components/ds/Pill"
import { assuntosDaArea } from "@/core/domain/subjects"

/**
 * Placeholder de Assunto `em breve` (ADR-0009) — mesmo padrão de
 * `/areas/[slug]/page.tsx`, um nível abaixo, dentro de Finanças.
 */
export function generateStaticParams() {
  return assuntosDaArea("financas")
    .filter((assunto) => assunto.estado === "em-breve")
    .map((assunto) => ({ assunto: assunto.slug }))
}

export default async function AssuntoPage({ params }: { params: Promise<{ assunto: string }> }) {
  const { assunto: slug } = await params
  const assunto = assuntosDaArea("financas").find((item) => item.slug === slug)
  if (!assunto || assunto.estado === "ativa") notFound()

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto mt-[8vh] flex max-w-[560px] flex-col items-center text-center">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] border border-luc-border bg-white/[0.04] text-luc-text-3">
          <AreaIcon name={assunto.icon} size={36} />
        </span>
        <Pill tone="coming-soon" className="mt-[18px] px-[11px] py-1">
          em breve
        </Pill>
        <h1 className="mt-4 text-[27px] font-extrabold tracking-[-0.02em] text-luc-text">
          {assunto.nome}
        </h1>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-luc-text-2">
          {assunto.resumo}. Este Assunto ainda não foi ativado — sem modelo, sem prazo.
        </p>
        <Button href="/areas/financas" variant="secondary" className="mt-[26px]">
          ← Voltar a Finanças
        </Button>
      </div>
    </div>
  )
}
