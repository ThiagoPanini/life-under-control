import { pessoaLogada } from "@/adapters/auth/pessoa-logada"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { desvincularMeuWhatsapp } from "@/app/(app)/whatsapp/actions"
import { PageHeader } from "@/components/ds/PageHeader"
import { RemoverVinculoWhatsappModal } from "@/components/whatsapp/RemoverVinculoWhatsappModal"
import { formatarTelefoneParaExibicao } from "@/components/whatsapp/telefone-mascara"
import { VincularWhatsappForm } from "@/components/whatsapp/VincularWhatsappForm"
import { getPainel } from "@/core/use-cases/get-painel"

export const dynamic = "force-dynamic"

const ROTA_WHATSAPP = "/whatsapp"

/**
 * Vínculo do WhatsApp da Pessoa (issue #152, fase 0 do ADR-0012): cada Pessoa
 * vincula/troca/remove o PRÓPRIO número — a coluna é a allowlist da borda de
 * ingestão, sem env redundante.
 */
export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ remover?: string }>
}) {
  const { remover } = await searchParams
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const pessoa = await pessoaLogada(lar.pessoas)
  const whatsappPhone = pessoa?.whatsappPhone ?? null

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[640px] flex-col gap-5">
        <PageHeader
          eyebrow="Integrações"
          title="WhatsApp"
          description="O número vinculado aqui é a allowlist do bot — só mensagens dele viram Proposta de Lançamento."
        />

        {pessoa ? (
          <VincularWhatsappForm key={whatsappPhone ?? "vazio"} whatsappPhone={whatsappPhone} />
        ) : (
          <p role="alert" className="text-luc-warn text-sm">
            Sessão sem Pessoa vinculada — não é possível editar o WhatsApp agora.
          </p>
        )}
      </div>

      {remover === "1" && whatsappPhone && (
        <RemoverVinculoWhatsappModal
          telefone={formatarTelefoneParaExibicao(whatsappPhone)}
          action={desvincularMeuWhatsapp}
          closeHref={ROTA_WHATSAPP}
        />
      )}
    </div>
  )
}
