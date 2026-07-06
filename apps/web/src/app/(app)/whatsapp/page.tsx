import { pessoaLogada } from "@/adapters/auth/pessoa-logada"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { PageHeader } from "@/components/ds/PageHeader"
import { VincularWhatsappForm } from "@/components/whatsapp/VincularWhatsappForm"
import { getPainel } from "@/core/use-cases/get-painel"

export const dynamic = "force-dynamic"

/**
 * Vínculo do WhatsApp da Pessoa (issue #152, fase 0 do ADR-0012): cada Pessoa
 * vincula/troca/remove o PRÓPRIO número — a coluna é a allowlist da borda de
 * ingestão, sem env redundante.
 */
export default async function WhatsappPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const pessoa = await pessoaLogada(lar.pessoas)

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[640px] flex-col gap-5">
        <PageHeader
          title="WhatsApp"
          description="O número vinculado aqui é a allowlist do bot — só mensagens dele viram Proposta de Lançamento."
        />

        {pessoa ? (
          <VincularWhatsappForm whatsappPhone={pessoa.whatsappPhone ?? null} />
        ) : (
          <p role="alert" className="text-luc-warn text-sm">
            Sessão sem Pessoa vinculada — não é possível editar o WhatsApp agora.
          </p>
        )}
      </div>
    </div>
  )
}
