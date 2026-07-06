import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { auth } from "@/auth"
import { PageHeader } from "@/components/ds/PageHeader"
import { VincularWhatsappForm } from "@/components/whatsapp/VincularWhatsappForm"
import { localAuthBypass } from "@/core/use-cases/gate"
import { getPainel } from "@/core/use-cases/get-painel"
import { resolverUsuarioAutenticado } from "@/core/use-cases/resolve-usuario-autenticado"

export const dynamic = "force-dynamic"

/**
 * Vínculo do WhatsApp da Pessoa (issue #152, fase 0 do ADR-0012): cada Pessoa
 * vincula/troca/remove o PRÓPRIO número — a coluna é a allowlist da borda de
 * ingestão, sem env redundante.
 */
export default async function WhatsappPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const bypass = localAuthBypass(
    process.env.NODE_ENV ?? "development",
    process.env.LUC_LOCAL_AUTH_BYPASS,
  )
  const email = bypass ? undefined : (await auth())?.user?.email
  const pessoa = resolverUsuarioAutenticado(lar.pessoas, email, bypass)

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
