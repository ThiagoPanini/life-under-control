import { criarConta } from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { PageHeader } from "@/components/ds/PageHeader"
import { Surface } from "@/components/ds/Surface"
import { ConnectedBillForm } from "@/components/financas/ConnectedBillForm"

/** Cadastro de uma Conta nova (wizard). A baixa de valor é outra história (#19). */
export default function NovaContaPage() {
  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <Button
          href="/areas/financas/pagamentos-recorrentes"
          variant="ghost"
          className="self-start"
        >
          ← Pagamentos Recorrentes
        </Button>
        <PageHeader
          title="Nova Conta"
          description="A regra de um pagamento que se repete: frequência e vencimento, nunca um valor."
        />

        <Surface className="p-5 sm:p-6">
          <ConnectedBillForm action={criarConta} />
        </Surface>
      </div>
    </div>
  )
}
